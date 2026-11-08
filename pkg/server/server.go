package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"path/filepath"
	"sync"
	"time"
	yavamfs "yavam/pkg/fs"
	"yavam/pkg/manager"
	"yavam/pkg/models"
	"yavam/pkg/services/auth"
	"yavam/pkg/services/config"
	"yavam/pkg/services/library"
	"yavam/pkg/updater"
	"yavam/pkg/utils"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type Server struct {
	ctx       context.Context
	httpSrv   *http.Server
	running   bool
	mu        sync.Mutex
	logMutex  sync.Mutex
	manager   *manager.Manager
	auth      auth.AuthService // Injected Auth Service
	assets    fs.FS            // Embedded frontend assets
	version   string           // App Version
	onRestore func()

	// SSE Clients
	clients   map[chan string]bool
	clientsMu sync.Mutex

	// Scan Management
	scanMu     sync.Mutex
	scanCancel context.CancelFunc

	scanWg sync.WaitGroup

	tickets                *eventTicketStore
	ticketsInit            sync.Once
	sessionRecheckInterval time.Duration

	SkipEvents bool // For testing

	logObserver func(message string) // tests capture log lines here
	boundAddr   string               // actual listener address, set by Start

	remoteLoginThrottle   *LoginThrottle
	loopbackLoginThrottle *LoginThrottle

	shutdownGracePeriod time.Duration // zero selects defaultShutdownGracePeriod
	readHeaderTimeout   time.Duration // zero selects defaultReadHeaderTimeout
	idleTimeout         time.Duration // zero selects defaultIdleTimeout
	jsonBodyReadTimeout time.Duration // zero selects defaultJSONBodyReadTimeout

	machineNames   map[string]bool // hostnames this machine answers to, see machineHostNames
	refusalNotices *refusalNotices
}

const (
	defaultShutdownGracePeriod = time.Second

	// defaultReadHeaderTimeout and defaultIdleTimeout bound connections that
	// never finish a request or sit unused. There is deliberately no overall
	// read or write timeout: event streams, multi-gigabyte uploads and large
	// downloads legitimately keep a connection busy for a long time.
	defaultReadHeaderTimeout = 10 * time.Second
	defaultIdleTimeout       = 2 * time.Minute
	maxRequestHeaderBytes    = 64 << 10
)

func NewServer(ctx context.Context, m *manager.Manager, authService auth.AuthService, assets fs.FS, version string, onRestore func()) *Server {
	return &Server{
		ctx:       ctx,
		manager:   m,
		auth:      authService,
		onRestore: onRestore,
		assets:    assets,
		version:   version,
		clients:   make(map[chan string]bool),
		tickets:   newEventTicketStore(time.Now),

		machineNames:   machineHostNames(),
		refusalNotices: newRefusalNotices(time.Now, refusalNoticeInterval, refusalNoticeMaxTracked),

		remoteLoginThrottle:   NewLoginThrottle(time.Now, loginThrottleBaseDelay, loginThrottleMaxDelay),
		loopbackLoginThrottle: NewLoginThrottle(time.Now, loginThrottleBaseDelay, loginThrottleMaxDelay),
	}
}

func (s *Server) UpdateLibraries(libraries []string) {
	s.log(fmt.Sprintf("Syncing allowed libraries: %d paths", len(libraries)))
}

func (s *Server) GetLibraries() []string {
	return s.manager.GetLibraries()
}

func (s *Server) log(message string) {
	s.logMutex.Lock()
	defer s.logMutex.Unlock()
	if s.logObserver != nil {
		s.logObserver(message)
	}
	if s.SkipEvents {
		return
	}
	// Emit log to frontend
	runtime.EventsEmit(s.ctx, "server:log", fmt.Sprintf("[%s] %s", time.Now().Format("15:04:05"), message))
}

func (s *Server) IsRunning() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running
}

func (s *Server) writeError(w http.ResponseWriter, message string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"message": message,
	})
}

// writeManagerError reports a manager failure, mapping a rejected path to 403.
func (s *Server) writeManagerError(w http.ResponseWriter, err error) {
	if errors.Is(err, manager.ErrPathNotAllowed) {
		s.writeError(w, "Security violation: path not allowed", http.StatusForbidden)
		return
	}
	if errors.Is(err, library.ErrCounterpartExists) {
		s.writeError(w, library.ErrCounterpartExists.Error(), http.StatusConflict)
		return
	}
	s.writeError(w, err.Error(), http.StatusInternalServerError)
}

func (s *Server) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		remoteIP := r.RemoteAddr
		if ip, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
			remoteIP = ip
		}

		s.log(fmt.Sprintf("[Request] %s -> %s %s", remoteIP, utils.SanitizeForLog(r.Method), utils.SanitizeForLog(r.URL.Path)))

		next.ServeHTTP(w, r)

		s.log(fmt.Sprintf("[Completed] %s %s in %v", utils.SanitizeForLog(r.Method), utils.SanitizeForLog(r.URL.Path), time.Since(start)))
	})
}

// corsMiddleware applies the same-origin CORS policy to every route, including
// the event stream. Preflights from other origins are rejected.
func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		originAccepted := applyCORSHeaders(w, r)

		if r.Method == http.MethodOptions {
			if r.Header.Get(headerOrigin) != "" && !originAccepted {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Broadcast sends a message to all connected SSE clients
func (s *Server) Broadcast(eventType string, data interface{}) {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()

	if s.SkipEvents {
		return
	}

	payload := map[string]interface{}{
		"event": eventType,
		"data":  data,
	}
	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		fmt.Printf("Error marshalling broadcast: %v\n", err)
		return
	}
	msg := fmt.Sprintf("data: %s\n\n", string(jsonBytes))

	for clientChan := range s.clients {
		select {
		case clientChan <- msg:
		default:
			// Drop message if channel is full to prevent blocking
		}
	}
}

// Start listens on bindHost:port. bindHost is the already-resolved host (see
// config.ResolveBindHost), for example "0.0.0.0" for all interfaces.
func (s *Server) Start(bindHost, port string, libraries []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return fmt.Errorf("server is already running")
	}

	mux := http.NewServeMux()

	// SSE Endpoint (Secured)
	mux.Handle("/api/events/ticket", s.NonSlidingAuthMiddleware(http.HandlerFunc(s.handleEventTicket)))

	mux.Handle("/api/events", s.eventsAuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sessionToken, _ := r.Context().Value(sessionTokenContextKey{}).(string)
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		clientChan := make(chan string, 1000) // Increase buffer
		s.clientsMu.Lock()
		s.clients[clientChan] = true
		s.clientsMu.Unlock()

		defer func() {
			s.clientsMu.Lock()
			delete(s.clients, clientChan)
			s.clientsMu.Unlock()
			close(clientChan)
		}()

		notify := r.Context().Done()
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		sessionRecheck := time.NewTicker(s.recheckInterval())
		defer sessionRecheck.Stop()

		for {
			select {
			case <-notify:
				return
			case <-sessionRecheck.C:
				if !s.sessionIsValid(sessionToken) {
					return
				}
			case msg := <-clientChan:
				fmt.Fprint(w, msg)
				if flusher, ok := w.(http.Flusher); ok {
					flusher.Flush()
				}
			case <-ticker.C:
				// Send a comment to keep the connection alive
				fmt.Fprint(w, ": keep-alive\n\n")
				if flusher, ok := w.(http.Flusher); ok {
					flusher.Flush()
				}
			}
		}
	})))

	// Scan Cancel Endpoint
	mux.Handle("/api/scan/cancel", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.scanMu.Lock()
		if s.scanCancel != nil {
			s.scanCancel()
		}
		s.scanMu.Unlock()

		// Wait for completion
		s.scanWg.Wait()

		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})))

	// Rate Limiter for Login: 5 attempts per minute
	loginLimiter := NewRateLimiter(5, 1*time.Minute)

	// Auth: Challenge Endpoint
	mux.HandleFunc("/api/auth/challenge", s.requireJSONContentType(loginLimiter.Middleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Username string `json:"username"`
		}
		if !s.decodeJSONBody(w, r, &req) {
			return
		}

		if s.auth == nil {
			s.writeError(w, "Auth service not initialized", 500)
			return
		}

		nonce, err := s.auth.InitiateLogin(req.Username)
		if err != nil {
			// Don't leak user existence? Actually for simple auth it's fine.
			// Ideally return generic error or 401.
			s.writeError(w, "Authentication failed", 401)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"nonce":   nonce,
		})
	})))

	// Auth: Login Endpoint (Simple Password)
	mux.HandleFunc("/api/auth/login", s.requireJSONContentType(loginLimiter.Middleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if s.auth == nil {
			s.writeError(w, "Auth service not initialized", 500)
			return
		}
		if s.rejectPasswordLogin(w, r) {
			return
		}

		var req struct {
			Username   string `json:"username"`
			Password   string `json:"password"`
			DeviceName string `json:"deviceName"`
			DeviceID   string `json:"deviceId"`
		}
		if !s.decodeJSONBody(w, r, &req) {
			return
		}

		// Charged only once the request is a well-formed JSON login, so a
		// blind cross-site POST cannot advance the lockout.
		throttle := s.throttleFor(r)
		if admitted, retryAfter := throttle.Admit(); !admitted {
			s.writeThrottled(w, retryAfter)
			return
		}

		token, err := s.auth.Login(req.Username, req.Password, req.DeviceName, req.DeviceID)
		if err != nil {
			s.log(fmt.Sprintf("Login failed for user %s from device %s: %v", utils.SanitizeForLog(req.Username), utils.SanitizeForLog(req.DeviceName), err))
			// Generic error for security
			s.writeError(w, "Invalid credentials", 401)
			return
		}
		throttle.Succeeded()
		s.log(fmt.Sprintf("User %s logged in successfully from %s",utils.SanitizeForLog(req.Username), utils.SanitizeForLog(req.DeviceName)))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"token":   token,
		})
	})))

	// Auth: one-time pairing code redemption (unauthenticated, shares the login limiter)
	mux.HandleFunc("/api/auth/pair", s.requireJSONContentType(loginLimiter.Middleware(s.handleAuthPair)))

	// Auth: pre-login capability status (unauthenticated, booleans only)
	mux.HandleFunc("/api/auth/status", s.handleAuthStatus)

	// Auth: List Sessions
	mux.Handle("/api/auth/sessions", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuthService(w) {
			return
		}
		sessions, err := s.auth.ListSessions()
		if err != nil {
			s.writeError(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(sessions)
	})))

	// Library Counts Endpoint
	mux.Handle("/api/library/counts", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			Libraries []string `json:"libraries"`
		}
		if !s.decodeJSONBody(w, r, &req) {
			return
		}

		// Security Check: Ensure all requested paths are allowed?
		// Actually, if client requests counts for arbitrary path, it might be info leak.
		// We should validate each path against s.libraries?
		// Or trust Manager? Manager gets counts for whatever path.
		// Let's validate.
		for _, lib := range req.Libraries {
			if err := s.manager.ValidatePath(lib); err != nil {
				s.writeError(w, "Access denied: Invalid library path", 403)
				return
			}
		}

		counts := s.manager.GetLibraryCounts(req.Libraries)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(counts)
	})))

	// Verify Endpoint
	mux.Handle("/api/auth/verify", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})))

	// Auth: Revoke Session
	mux.Handle("/api/auth/revoke", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			ID string `json:"id"`
		}
		if !s.decodeJSONBody(w, r, &req) {
			return
		}

		if !s.requireAuthService(w) {
			return
		}
		if err := s.auth.RevokeSession(req.ID); err != nil {
			s.writeError(w, err.Error(), 500)
			return
		}

		// Broadcast revoked event to force clients to logout immediately
		s.Broadcast("auth:revoked", map[string]string{"id": req.ID})

		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})))

	mux.Handle("/api/packages", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		w.Header().Set("Content-Type", "application/json")

		// Allow client to request a specific library, default to activePath
		targetPath := r.URL.Query().Get("path")

		if targetPath == "" {
			s.writeError(w, "No library path selected", 400)
			return
		}

		if targetPath == "" {
			s.writeError(w, "No library path selected", 400)
			return
		}

		s.log(fmt.Sprintf("Client requested packages for: %s", utils.SanitizeForLog(targetPath)))

		// Security: Ensure targetPath is in allowed libraries
		if err := s.manager.ValidatePath(targetPath); err != nil {
			s.log(fmt.Sprintf("Access denied. Target: %s. Error: %s", utils.SanitizeForLog(targetPath), utils.SanitizeForLog(err.Error())))
			s.writeError(w, "Access denied to this library path", 403)
			return
		}

		// Cancel previous scan if running (wait for it)
		s.scanMu.Lock()
		if s.scanCancel != nil {
			s.scanCancel()
		}
		s.scanMu.Unlock()
		s.scanWg.Wait()

		s.scanMu.Lock()
		// Wrap request context but allow manual cancellation
		ctx, cancel := context.WithCancel(r.Context())
		s.scanCancel = cancel
		s.scanMu.Unlock()

		s.scanWg.Add(1)
		defer s.scanWg.Done()

		var pkgs []models.VarPackage
		err := s.manager.ScanFull(
			ctx,
			targetPath,
			// Phase 1 — Light Pass: file discovered
			func(pkg models.VarPackage) {
				pkgs = append(pkgs, pkg)
				s.Broadcast("package:discovered", pkg)
			},
			// Phase 2 — Hard Pass: full metadata
			func(pkg models.VarPackage) {
				s.Broadcast("package:scanned", pkg)
			},
			// Phase 3 — Link Pass: batch analysis
			func(analyses []library.PackageAnalysis) {
				s.Broadcast("scan:analysis:complete", analyses)
			},
			// Stage progress
			func(sp library.ScanStageProgress) {
				s.Broadcast("scan:stage", sp)
			},
		)
		if errors.Is(err, context.Canceled) {
			return
		}
		if err != nil {
			s.Broadcast("scan:error", err.Error())
			s.writeError(w, err.Error(), 500)
			return
		}

		// Notify completion so frontend stops spinner
		s.Broadcast("scan:complete", true)

		json.NewEncoder(w).Encode(pkgs)
	})))

	// Disk Space Endpoint
	mux.Handle("/api/disk-space", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		targetPath := r.URL.Query().Get("path")

		if targetPath == "" {
			s.writeError(w, "No library path selected", 400)
			return
		}

		if targetPath == "" {
			s.writeError(w, "No library path selected", 400)
			return
		}

		// Security: Ensure targetPath is in allowed libraries
		if err := s.manager.ValidatePath(targetPath); err != nil {
			s.writeError(w, "Access denied", 403)
			return
		}

		info, err := s.manager.GetDiskSpace(targetPath)
		if err != nil {
			s.writeError(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(info)
	})))

	// Thumbnail Endpoint
	mux.Handle("/api/thumbnail", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		filePath := r.URL.Query().Get("filePath")
		if filePath == "" {
			http.NotFound(w, r)
			return
		}

		// If activePath is empty and filePath is not in libraries, this might fail blindly or allow if logic is flawed.
		// If activePath is empty, strings.HasPrefix check for it might behave oddly?
		// strings.HasPrefix("anything", "") is TRUE.
		// So we MUST check if activePath is empty before allowing based on it.

		// Security Check
		if err := s.manager.ValidatePath(filePath); err != nil {
			s.writeError(w, "Access denied", 403)
			return
		}

		thumbData, err := s.manager.GetThumbnail(filePath)
		if err != nil {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.Write(thumbData)
	})))

	// Contents Endpoint (for Web Mode)
	mux.Handle("/api/contents", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			FilePath string `json:"filePath"`
		}
		if !s.decodeJSONBody(w, r, &req) {
			return
		}

		// Security Check
		if err := s.manager.ValidatePath(req.FilePath); err != nil {
			s.writeError(w, "Access denied", 403)
			return
		}

		contents, err := s.manager.GetPackageContents(req.FilePath)
		if err != nil {
			s.writeError(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(contents)
	})))

	// Config Endpoint
	mux.Handle("/api/config", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			// Update Config
			var req map[string]interface{}
			if !s.decodeJSONBody(w, r, &req) {
				return
			}

			err := s.manager.UpdateConfig(func(cfg *config.Config) {
				// Update Public Access
				if val, ok := req["publicAccess"]; ok {
					if v, ok := val.(bool); ok {
						cfg.PublicAccess = v
					}
				}
			})

			if err != nil {
				s.writeError(w, "Failed to update config: "+err.Error(), 500)
				return
			}

			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]bool{"success": true})
			return
		}

		// GET Request
		cfg := s.manager.GetConfig()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"webMode": true,
			// config.json's own Libraries field is stale (zeroed post-SQLite
			// migration); the DB is the source of truth, same as App.GetConfig
			// already does for the desktop bridge.
			"libraries":    s.manager.GetLibraries(),
			"version":      s.version,
			"publicAccess": cfg.PublicAccess,
			"setupDone":    cfg.SetupDone,
		})
	})))

	// Version Check Endpoint
	mux.Handle("/api/version/check", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		info, err := updater.GetLatestVersion(s.version, s.manager.GetConfig().UpdateChannel)
		if err != nil {
			s.writeError(w, err.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(info)
	})))

	// Upload Endpoint
	mux.Handle("/api/upload", s.AuthMiddleware(http.HandlerFunc(s.handleUpload)))

	// Toggle Endpoint
	mux.Handle("/api/toggle", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			FilePath    string `json:"filePath"`
			Enable      bool   `json:"enable"`
			Merge       bool   `json:"merge"`
			LibraryPath string `json:"libraryPath"`
		}
		if !s.decodeJSONBody(w, r, &req) {
			return
		}

		targetLib := req.LibraryPath
		if targetLib == "" {
			s.writeError(w, "Library path is required", 400)
			return
		}

		newPath, err := s.manager.TogglePackage(nil, req.FilePath, req.Enable, targetLib, req.Merge)
		if err != nil {
			s.log(fmt.Sprintf("Error toggling package: %s", utils.SanitizeForLog(err.Error())))
			s.writeManagerError(w, err)
			return
		}

		s.log(fmt.Sprintf("Toggled package: %s (Enabled: %v)", utils.SanitizeForLog(filepath.Base(req.FilePath)), req.Enable))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"newPath": newPath,
		})
	})))

	// Package Rating Endpoint
	mux.Handle("/api/package-rating", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Family string `json:"family"`
			Rating int    `json:"rating"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			s.writeError(w, err.Error(), 400)
			return
		}
		if req.Family == "" {
			s.writeError(w, "Family is required", 400)
			return
		}
		if req.Rating < 0 || req.Rating > 5 {
			s.writeError(w, "Rating must be between 0 and 5", 400)
			return
		}

		if err := s.manager.SetPackageRating(req.Family, req.Rating); err != nil {
			s.log(fmt.Sprintf("Error setting package rating: %v", err))
			s.writeError(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
	})))

	// Package Favorite Endpoint
	mux.Handle("/api/package-favorite", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Family   string `json:"family"`
			Favorite bool   `json:"favorite"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			s.writeError(w, err.Error(), 400)
			return
		}
		if req.Family == "" {
			s.writeError(w, "Family is required", 400)
			return
		}

		if err := s.manager.SetPackageFavorite(req.Family, req.Favorite); err != nil {
			s.log(fmt.Sprintf("Error setting package favorite: %v", err))
			s.writeError(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
	})))

	// Delete Endpoint
	mux.Handle("/api/delete", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			FilePath    string `json:"filePath"`
			LibraryPath string `json:"libraryPath"`
		}
		if !s.decodeJSONBody(w, r, &req) {
			return
		}

		targetLib := req.LibraryPath
		if targetLib == "" {
			s.writeError(w, "Library path is required", 400)
			return
		}

		// Security Check
		// Ensure targetLib is allowed library
		if err := s.manager.ValidatePath(targetLib); err != nil {
			s.writeError(w, "Security violation: Invalid library", 403)
			return
		}

		// Ensure file path is allowed (redundant if checking parent, but safer)
		if err := s.manager.ValidatePath(req.FilePath); err != nil {
			s.writeError(w, "Security violation: Invalid file path", 403)
			return
		}

		if err := s.manager.DeleteToTrash(req.FilePath); err != nil {
			switch {
			case errors.Is(err, yavamfs.ErrFileNotFound):
				s.log(fmt.Sprintf("Delete skipped, file already missing: %s", utils.SanitizeForLog(filepath.Base(req.FilePath))))
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]interface{}{
					"success":        false,
					"alreadyMissing": true,
				})
			case errors.Is(err, yavamfs.ErrUnsafeRecycleBinVolume):
				s.log(fmt.Sprintf("Delete refused, unsafe recycle bin volume: %s", utils.SanitizeForLog(filepath.Base(req.FilePath))))
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusConflict)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"success":      false,
					"unsafeVolume": true,
					"message":      "This location has no recycle bin; refusing to delete without explicit confirmation",
				})
			default:
				s.log(fmt.Sprintf("Error deleting package: %s", utils.SanitizeForLog(err.Error())))
				s.writeError(w, err.Error(), 500)
			}
			return
		}

		s.log(fmt.Sprintf("Deleted package: %s", utils.SanitizeForLog(filepath.Base(req.FilePath))))
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
	})))

	// Install Endpoint (Copy/Move to Library)
	mux.Handle("/api/install", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			FilePaths []string `json:"filePaths"`
			DestLib   string   `json:"destLib"`
			Overwrite bool     `json:"overwrite"`
		}
		if !s.decodeJSONBody(w, r, &req) {
			return
		}

		destPath := req.DestLib
		if destPath == "" {
			s.writeError(w, "Destination path is required", 400)
			return
		}

		collisions, err := s.manager.CopyPackagesToLibrary(req.FilePaths, destPath, req.Overwrite, func(current, total int, filename string, status string) {
			s.Broadcast("install-progress", map[string]interface{}{
				"current":  current,
				"total":    total,
				"filename": filename,
				"status":   status,
			})
		})
		if err != nil {
			s.log(fmt.Sprintf("Error installing packages: %s", utils.SanitizeForLog(err.Error())))
			s.writeManagerError(w, err)
			return
		}

		if len(collisions) > 0 {
			s.log(fmt.Sprintf("Install collisions detected: %d files", len(collisions)))
		} else {
			s.log(fmt.Sprintf("Installed %d packages to %s", len(req.FilePaths), utils.SanitizeForLog(filepath.Base(destPath))))
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":    true,
			"collisions": collisions,
		})
	})))

	// Collision Check Endpoint
	mux.Handle("/api/scan/collisions", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Files []string `json:"files"`
			Path  string   `json:"path"`
		}
		if !s.decodeJSONBody(w, r, &req) {
			return
		}

		targetPath := req.Path
		if targetPath == "" {
			s.writeError(w, "Target path is required", 400)
			return
		}

		// Security Check
		if err := s.manager.ValidatePath(targetPath); err != nil {
			s.writeError(w, "Access denied: Invalid library path", 403)
			return
		}

		collisions, err := s.manager.CheckCollisions(req.Files, targetPath)
		if err != nil {
			s.writeError(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":    true,
			"collisions": collisions,
		})
	})))

	// Restore Endpoint
	mux.Handle("/api/restore", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		s.log("Client requested window restore.")
		if s.onRestore != nil {
			s.onRestore()
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
	})))

	// Serve Frontend (Dist)
	// Use embedded assets
	distFs := http.FileServer(http.FS(s.assets))

	// Custom File Serving Logic
	mux.Handle("/files/", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Expected format: /files/encodedpath OR /files/?path=... (cleaner to key off valid paths)
		// Simplest: The frontend requests the file by partial path, but we need to know WHICH library.
		// Actually, the package struct usually contains "filePath". In web mode, we might need to send absolute path?
		// If we send absolute path, we just check if it starts with any of allowed libraries.

		// relPath := strings.TrimPrefix(r.URL.Path, "/files/")
		// Warning: This implies the client sends relative path?
		// Or if the client sends "/files/C:/Users/..." unescaped?
		// Let's assume the client might send a query param or we map it.
		// Better: frontend constructs url like `/files/?path=${pkg.filePath}`

		targetFile := r.URL.Query().Get("path")
		if targetFile == "" {
			// Fallback to URL path logic if query is missing (legacy)
			// But stripping prefix from absolute path is messy.
			http.NotFound(w, r)
			return
		}

		// Security Check: targetFile must be inside one of the libraries
		if err := s.manager.ValidatePath(targetFile); err != nil {
			s.writeError(w, "Access denied: File not in allowed libraries", 403)
			return
		}

		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filepath.Base(targetFile)))
		w.Header().Set("Content-Type", "application/octet-stream")
		http.ServeFile(w, r, targetFile)
	})))

	mux.Handle("/", distFs)

	s.httpSrv = &http.Server{
		Addr:    net.JoinHostPort(bindHost, port),
		Handler: s.hostGuardMiddleware(s.corsMiddleware(s.loggingMiddleware(mux))),

		ReadHeaderTimeout: durationOrDefault(s.readHeaderTimeout, defaultReadHeaderTimeout),
		IdleTimeout:       durationOrDefault(s.idleTimeout, defaultIdleTimeout),
		MaxHeaderBytes:    maxRequestHeaderBytes,
	}

	listener, err := net.Listen("tcp", s.httpSrv.Addr)
	if err != nil {
		s.log(fmt.Sprintf("Error starting listener: %v", err))
		return err
	}

	s.running = true
	s.boundAddr = listener.Addr().String()

	s.log(fmt.Sprintf("Starting server on %s...", s.boundAddr))
	s.log(fmt.Sprintf("Serving %d libraries.", len(libraries)))
	s.log("Web interface available at root URL.")

	go func() {
		if err := s.httpSrv.Serve(listener); err != nil && err != http.ErrServerClosed {
			s.log(fmt.Sprintf("Server error: %v", err))
			s.mu.Lock()
			s.running = false
			s.mu.Unlock()
		}
	}()

	s.log(fmt.Sprintf("Server active at http://%s:%s", s.GetOutboundIP(), port))
	return nil
}

func durationOrDefault(configured, fallback time.Duration) time.Duration {
	if configured <= 0 {
		return fallback
	}
	return configured
}

func (s *Server) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running || s.httpSrv == nil {
		return nil
	}

	s.log("Stopping server...")
	grace := s.shutdownGracePeriod
	if grace <= 0 {
		grace = defaultShutdownGracePeriod
	}
	ctx, cancel := context.WithTimeout(context.Background(), grace)
	defer cancel()

	err := s.httpSrv.Shutdown(ctx)
	if err != nil {
		// Streams that outlive the grace period would otherwise keep being
		// served on an address the caller believes is closed.
		s.log(fmt.Sprintf("Graceful shutdown timed out, closing remaining connections: %v", err))
		err = s.httpSrv.Close()
	}

	s.running = false
	s.log("Server stopped.")
	return err
}

func (s *Server) GetOutboundIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)

	return localAddr.IP.String()
}
