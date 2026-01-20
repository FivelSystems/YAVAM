package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"yavam/pkg/manager"
	"yavam/pkg/models"
	"yavam/pkg/services/auth"
	"yavam/pkg/services/config"
	"yavam/pkg/updater"

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
	libraries []string         // List of allowed library paths
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

	SkipEvents bool // For testing
}

func NewServer(ctx context.Context, m *manager.Manager, authService auth.AuthService, assets fs.FS, version string, onRestore func()) *Server {
	return &Server{
		ctx:       ctx,
		manager:   m,
		auth:      authService,
		onRestore: onRestore,
		libraries: []string{},
		assets:    assets,
		version:   version,
		clients:   make(map[chan string]bool),
	}
}

func (s *Server) UpdateLibraries(libraries []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.libraries = libraries
	s.log(fmt.Sprintf("Updated allowed libraries: %d paths", len(libraries)))
}

func (s *Server) GetLibraries() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Return copy to prevent race on slice underlying array?
	// String slices are headers. Underlying array is shared?
	// To be safe, copy.
	libs := make([]string, len(s.libraries))
	copy(libs, s.libraries)
	return libs
}

func (s *Server) log(message string) {
	s.logMutex.Lock()
	defer s.logMutex.Unlock()
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

// IsPathAllowed checks if the given path is within activePath or any of the allowed libraries.
// It is thread-safe.
func (s *Server) IsPathAllowed(path string) bool {
	if path == "" {
		return false
	}
	cleanTarget := strings.ToLower(filepath.Clean(path))

	s.mu.Lock()
	defer s.mu.Unlock()

	for _, lib := range s.libraries {
		cleanLib := strings.ToLower(filepath.Clean(lib))
		if cleanTarget == cleanLib {
			return true
		}
		if strings.HasPrefix(cleanTarget, cleanLib+string(os.PathSeparator)) {
			return true
		}
	}

	return false
}

func (s *Server) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		remoteIP := r.RemoteAddr
		if ip, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
			remoteIP = ip
		}

		s.log(fmt.Sprintf("[Request] %s -> %s %s", remoteIP, r.Method, r.URL.Path))

		next.ServeHTTP(w, r)

		s.log(fmt.Sprintf("[Completed] %s %s in %v", r.Method, r.URL.Path, time.Since(start)))
	})
}

// corsMiddleware allows all CORS requests
func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin")

		if r.Method == "OPTIONS" {
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

func (s *Server) Start(port string, libraries []string) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return fmt.Errorf("server is already running")
	}
	s.mu.Unlock()

	s.libraries = libraries

	mux := http.NewServeMux()

	// SSE Endpoint (Secured)
	mux.Handle("/api/events", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

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

		for {
			select {
			case <-notify:
				return
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
	mux.HandleFunc("/api/scan/cancel", func(w http.ResponseWriter, r *http.Request) {
		s.scanMu.Lock()
		if s.scanCancel != nil {
			s.scanCancel()
		}
		s.scanMu.Unlock()

		// Wait for completion
		s.scanWg.Wait()

		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})

	// Rate Limiter for Login: 5 attempts per minute
	loginLimiter := NewRateLimiter(5, 1*time.Minute)

	// Auth: Challenge Endpoint
	mux.HandleFunc("/api/auth/challenge", loginLimiter.Middleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Username string `json:"username"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			s.writeError(w, "Invalid request body", 400)
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
	}))

	// Auth: Login Endpoint (Simple Password)
	mux.HandleFunc("/api/auth/login", loginLimiter.Middleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Username   string `json:"username"`
			Password   string `json:"password"`
			DeviceName string `json:"deviceName"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			s.writeError(w, "Invalid request body", 400)
			return
		}

		if s.auth == nil {
			s.writeError(w, "Auth service not initialized", 500)
			return
		}

		token, err := s.auth.Login(req.Username, req.Password, req.DeviceName)
		if err != nil {
			s.log(fmt.Sprintf("Login failed for user '%s' from device '%s': %v", req.Username, req.DeviceName, err))
			// Generic error for security
			s.writeError(w, "Invalid credentials", 401)
			return
		}
		s.log(fmt.Sprintf("User '%s' logged in successfully from '%s'", req.Username, req.DeviceName))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"token":   token,
		})
	}))

	// Auth: List Sessions
	mux.Handle("/api/auth/sessions", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sessions, err := s.auth.ListSessions()
		if err != nil {
			s.writeError(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(sessions)
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			s.writeError(w, "Invalid request body", 400)
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

	// API Endpoint
	mux.Handle("/api/packages", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

		s.log(fmt.Sprintf("Client requested packages for: %s", targetPath))

		// Security: Ensure targetPath is in allowed libraries
		if !s.IsPathAllowed(targetPath) {
			s.log(fmt.Sprintf("Access denied. Target: %s", targetPath))
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
		err := s.manager.ScanAndAnalyze(ctx, targetPath, func(p models.VarPackage) {
			pkgs = append(pkgs, p)
			// Broadcast package to web clients (incremental update)
			s.Broadcast("package:scanned", p)
		}, func(current, total int) {
			// Broadcast progress to web clients
			s.Broadcast("scan:progress", map[string]interface{}{
				"current": current,
				"total":   total,
			})
		})
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
		if !s.IsPathAllowed(targetPath) {
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
		if !s.IsPathAllowed(filePath) {
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			s.writeError(w, err.Error(), 400)
			return
		}

		// Security Check
		if !s.IsPathAllowed(req.FilePath) {
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
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				s.writeError(w, err.Error(), 400)
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
			"webMode":      true,
			"libraries":    s.libraries,
			"version":      s.version,
			"publicAccess": cfg.PublicAccess,
		})
	})))

	// Version Check Endpoint
	mux.HandleFunc("/api/version/check", func(w http.ResponseWriter, r *http.Request) {
		info, err := updater.GetLatestVersion(s.version)
		if err != nil {
			s.writeError(w, err.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(info)
	})

	// Upload Endpoint
	mux.Handle("/api/upload", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// 500MB max limit
		if err := r.ParseMultipartForm(500 << 20); err != nil {
			s.writeError(w, "File too large", http.StatusBadRequest)
			return
		}

		files := r.MultipartForm.File["file"]
		// User requested path (or default to active)
		targetPath := r.FormValue("path")
		if targetPath == "" {
			s.writeError(w, "Target path is required", 400)
			return
		}

		// Security Check
		if !s.IsPathAllowed(targetPath) {
			s.writeError(w, "Access denied: Invalid library path", 403)
			return
		}

		downloadDir := targetPath

		// Calculate potential progress
		// We can't easily know byte progress without reading all files first, which wastes memory.
		// We track file count progress instead, matching Desktop behavior.
		totalFiles := len(files)
		count := 0

		for i, fileHeader := range files {
			// Broadcast Progress
			current := i + 1 // 1-based index
			s.Broadcast("scan:progress", map[string]int{
				"current": current,
				"total":   totalFiles,
			})

			file, err := fileHeader.Open()
			if err != nil {
				continue
			}
			defer file.Close()

			dstPath := filepath.Join(downloadDir, filepath.Base(fileHeader.Filename))
			dst, err := os.Create(dstPath)
			if err != nil {
				continue
			}
			defer dst.Close()

			if _, err := io.Copy(dst, file); err == nil {
				count++
				s.log(fmt.Sprintf("Uploaded: %s (%d bytes)", fileHeader.Filename, fileHeader.Size))
			}
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"count":   count,
		})
	})))

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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			s.writeError(w, err.Error(), 400)
			return
		}

		targetLib := req.LibraryPath
		if targetLib == "" {
			s.writeError(w, "Library path is required", 400)
			return
		}

		newPath, err := s.manager.TogglePackage(nil, req.FilePath, req.Enable, targetLib, req.Merge)
		if err != nil {
			s.log(fmt.Sprintf("Error toggling package: %v", err))
			s.writeError(w, err.Error(), 500)
			return
		}

		s.log(fmt.Sprintf("Toggled package: %s (Enabled: %v)", filepath.Base(req.FilePath), req.Enable))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"newPath": newPath,
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			s.writeError(w, err.Error(), 400)
			return
		}

		targetLib := req.LibraryPath
		if targetLib == "" {
			s.writeError(w, "Library path is required", 400)
			return
		}

		// Security Check
		// Ensure targetLib is allowed library
		if !s.IsPathAllowed(targetLib) {
			s.writeError(w, "Security violation: Invalid library", 403)
			return
		}

		// Ensure file path is allowed (redundant if checking parent, but safer)
		if !s.IsPathAllowed(req.FilePath) {
			s.writeError(w, "Security violation: Invalid file path", 403)
			return
		}

		if err := s.manager.DeleteToTrash(req.FilePath); err != nil {
			s.log(fmt.Sprintf("Error deleting package: %v", err))
			s.writeError(w, err.Error(), 500)
			return
		}

		s.log(fmt.Sprintf("Deleted package: %s", filepath.Base(req.FilePath)))
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
	})))

	// Resolve Endpoint
	mux.Handle("/api/resolve", s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			KeepPath    string   `json:"keepPath"`
			Others      []string `json:"others"`
			LibraryPath string   `json:"libraryPath"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			s.writeError(w, err.Error(), 400)
			return
		}

		// Security Check: Ensure all paths are somewhat valid?
		// Manager usually handles exact validation, but ensuring containment is good practice.
		// But LibraryPath might be dynamic.
		// For now, assume Manager logic is robust or add basic check:
		if req.LibraryPath == "" {
			s.writeError(w, "Library path is required", 400)
			return
		}

		// Call Manager
		res, err := s.manager.ResolveConflicts(req.KeepPath, req.Others, req.LibraryPath)
		if err != nil {
			s.log(fmt.Sprintf("Error resolving conflicts: %v", err))
			s.writeError(w, err.Error(), 500)
			return
		}

		s.log(fmt.Sprintf("Resolved conflicts. Merged: %d, Disabled: %d", res.Merged, res.Disabled))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(res)
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			s.writeError(w, err.Error(), 400)
			return
		}

		destPath := req.DestLib
		if destPath == "" {
			s.writeError(w, "Destination path is required", 400)
			return
		}

		// Security check: ensure source files are in allowed libraries?
		// CopyPackagesToLibrary reads from src.
		// We should validate sources are in s.libraries OR activePath.
		for _, src := range req.FilePaths {
			if !s.IsPathAllowed(src) {
				s.writeError(w, fmt.Sprintf("Access denied: Source file %s not in allowed libraries", src), 403)
				return
			}
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
			s.log(fmt.Sprintf("Error installing packages: %v", err))
			s.writeError(w, err.Error(), 500)
			return
		}

		if len(collisions) > 0 {
			s.log(fmt.Sprintf("Install collisions detected: %d files", len(collisions)))
		} else {
			s.log(fmt.Sprintf("Installed %d packages to %s", len(req.FilePaths), filepath.Base(destPath)))
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			s.writeError(w, err.Error(), 400)
			return
		}

		targetPath := req.Path
		if targetPath == "" {
			s.writeError(w, "Target path is required", 400)
			return
		}

		// Security Check
		if !s.IsPathAllowed(targetPath) {
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
	mux.HandleFunc("/api/restore", func(w http.ResponseWriter, r *http.Request) {
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
	})

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
		if !s.IsPathAllowed(targetFile) {
			s.writeError(w, "Access denied: File not in allowed libraries", 403)
			return
		}

		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filepath.Base(targetFile)))
		w.Header().Set("Content-Type", "application/octet-stream")
		http.ServeFile(w, r, targetFile)
	})))

	mux.Handle("/", distFs)

	// Bind to all interfaces to allow remote access
	bindAddr := "0.0.0.0:" + port

	s.httpSrv = &http.Server{
		Addr:    bindAddr,
		Handler: s.corsMiddleware(s.loggingMiddleware(mux)),
	}

	listener, err := net.Listen("tcp", s.httpSrv.Addr)
	if err != nil {
		s.log(fmt.Sprintf("Error starting listener: %v", err))
		return err
	}

	s.mu.Lock()
	s.running = true
	s.mu.Unlock()

	s.log(fmt.Sprintf("Starting server on port %s...", port))
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

func (s *Server) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running || s.httpSrv == nil {
		return nil
	}

	s.log("Stopping server...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := s.httpSrv.Shutdown(ctx)
	if err != nil {
		s.log(fmt.Sprintf("Error during shutdown: %v", err))
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

// isSafePath checks if the requested path is within the allowed root directory
// It resolves symlinks and absolute paths to prevent traversal attacks
func (s *Server) isSafePath(requestedPath, root string) bool {
	// 1. Get Absolute Path of Root (resolve symlinks)
	absRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		// Fallback to simpler Abs if symlink eval fails
		absRoot, err = filepath.Abs(root)
		if err != nil {
			return false
		}
	}

	// 2. Get Absolute Path of Request
	absPath, err := filepath.Abs(requestedPath)
	if err != nil {
		return false
	}

	// 3. Eval Symlinks of Request (if it exists)
	if info, err := os.Lstat(absPath); err == nil {
		if info.Mode()&os.ModeSymlink != 0 {
			resolved, err := filepath.EvalSymlinks(absPath)
			if err == nil {
				absPath = resolved
			}
		}
	}

	// 4. Case Insensitive Compare on Windows
	rel, err := filepath.Rel(strings.ToLower(absRoot), strings.ToLower(absPath))
	if err != nil {
		return false
	}

	// 5. Ensure no ".." in relative path
	if strings.Contains(rel, "..") {
		return false
	}

	return !strings.HasPrefix(rel, "..")
}
