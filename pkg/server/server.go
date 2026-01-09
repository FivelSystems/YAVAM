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
	"varmanager/pkg/manager"
	"varmanager/pkg/models"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type Server struct {
	ctx       context.Context
	httpSrv   *http.Server
	running   bool
	mu        sync.Mutex
	logMutex  sync.Mutex
	manager   *manager.Manager
	libraries []string // List of allowed library paths
	assets    fs.FS    // Embedded frontend assets
	onRestore func()

	// SSE Clients
	clients   map[chan string]bool
	clientsMu sync.Mutex
}

func NewServer(ctx context.Context, m *manager.Manager, assets fs.FS, onRestore func()) *Server {
	return &Server{
		ctx:       ctx,
		manager:   m,
		onRestore: onRestore,
		libraries: []string{},
		assets:    assets,
		clients:   make(map[chan string]bool),
	}
}

func (s *Server) UpdateLibraries(libraries []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.libraries = libraries
	s.log(fmt.Sprintf("Updated allowed libraries: %d paths", len(libraries)))
}

func (s *Server) log(message string) {
	s.logMutex.Lock()
	defer s.logMutex.Unlock()
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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

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

func (s *Server) Start(port string, activePath string, libraries []string) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return fmt.Errorf("server is already running")
	}
	s.mu.Unlock()

	// Check if path exists
	if activePath == "" {
		return fmt.Errorf("invalid path")
	}

	s.libraries = libraries

	mux := http.NewServeMux()

	// SSE Endpoint
	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
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
		for {
			select {
			case <-notify:
				return
			case msg := <-clientChan:
				fmt.Fprint(w, msg)
				if flusher, ok := w.(http.Flusher); ok {
					flusher.Flush()
				}
			}
		}
	})

	// API Endpoint
	mux.HandleFunc("/api/packages", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Allow client to request a specific library, default to activePath
		targetPath := r.URL.Query().Get("path")
		if targetPath == "" {
			targetPath = activePath
		}

		s.log(fmt.Sprintf("Client requested packages for: %s", targetPath))

		// Security: Ensure targetPath is in allowed libraries
		// Normalize paths for comparison (handle slashes and case)
		allowed := false
		cleanTarget := strings.ToLower(filepath.Clean(targetPath))
		cleanActive := strings.ToLower(filepath.Clean(activePath))

		if cleanTarget == cleanActive {
			allowed = true
		} else {
			for _, lib := range s.libraries {
				if strings.ToLower(filepath.Clean(lib)) == cleanTarget {
					allowed = true
					break
				}
			}
		}

		if !allowed {
			s.log(fmt.Sprintf("Access denied. Target: %s, Allowed: %v", cleanTarget, s.libraries))
			s.writeError(w, "Access denied to this library path", 403)
			return
		}

		var pkgs []models.VarPackage
		err := s.manager.ScanAndAnalyze(r.Context(), targetPath, func(p models.VarPackage) {
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
			s.writeError(w, err.Error(), 500)
			return
		}

		json.NewEncoder(w).Encode(pkgs)
	})

	// Thumbnail Endpoint
	mux.HandleFunc("/api/thumbnail", func(w http.ResponseWriter, r *http.Request) {
		filePath := r.URL.Query().Get("filePath")
		if filePath == "" {
			http.NotFound(w, r)
			return
		}

		// Security Check
		cleanTarget := strings.ToLower(filepath.Clean(filePath))
		cleanActive := strings.ToLower(filepath.Clean(activePath))
		allowed := false

		if strings.HasPrefix(cleanTarget, cleanActive) {
			allowed = true
		} else {
			for _, lib := range s.libraries {
				cleanLib := strings.ToLower(filepath.Clean(lib))
				if strings.HasPrefix(cleanTarget, cleanLib) {
					allowed = true
					break
				}
			}
		}

		if !allowed {
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
	})

	// Contents Endpoint (for Web Mode)
	mux.HandleFunc("/api/contents", func(w http.ResponseWriter, r *http.Request) {
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
		cleanTarget := strings.ToLower(filepath.Clean(req.FilePath))
		cleanActive := strings.ToLower(filepath.Clean(activePath))
		allowed := false

		if cleanTarget == cleanActive {
			allowed = true // Should not happen for file, but path logic
		} else if strings.HasPrefix(cleanTarget, cleanActive+string(os.PathSeparator)) {
			allowed = true
		} else {
			for _, lib := range s.libraries {
				cleanLib := strings.ToLower(filepath.Clean(lib))
				if strings.HasPrefix(cleanTarget, cleanLib+string(os.PathSeparator)) {
					allowed = true
					break
				}
			}
		}

		if !allowed {
			s.writeError(w, "Access denied: File not in allowed libraries", 403)
			return
		}

		contents, err := s.manager.GetPackageContents(req.FilePath)
		if err != nil {
			s.writeError(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(contents)
	})

	// Config Endpoint
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"webMode":   true,
			"path":      activePath,
			"libraries": s.libraries,
		})
	})

	// Upload Endpoint
	mux.HandleFunc("/api/upload", func(w http.ResponseWriter, r *http.Request) {
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
			targetPath = activePath
		}

		// Security Check
		cleanTarget := strings.ToLower(filepath.Clean(targetPath))
		cleanActive := strings.ToLower(filepath.Clean(activePath))
		allowed := false

		if cleanTarget == cleanActive {
			allowed = true
		} else {
			for _, lib := range s.libraries {
				if strings.ToLower(filepath.Clean(lib)) == cleanTarget {
					allowed = true
					break
				}
			}
		}

		if !allowed {
			s.writeError(w, "Access denied: Invalid library path", 403)
			return
		}

		downloadDir := targetPath

		count := 0
		for _, fileHeader := range files {
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
	})

	// Toggle Endpoint
	mux.HandleFunc("/api/toggle", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			FilePath string `json:"filePath"`
			Enable   bool   `json:"enable"`
			Merge    bool   `json:"merge"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			s.writeError(w, err.Error(), 400)
			return
		}

		newPath, err := s.manager.TogglePackage(nil, req.FilePath, req.Enable, activePath, req.Merge)
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
	})

	// Delete Endpoint
	mux.HandleFunc("/api/delete", func(w http.ResponseWriter, r *http.Request) {
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
		rel, err := filepath.Rel(activePath, req.FilePath)
		if err != nil || strings.HasPrefix(rel, "..") {
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
	})

	// Resolve Endpoint
	mux.HandleFunc("/api/resolve", func(w http.ResponseWriter, r *http.Request) {
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
			req.LibraryPath = activePath
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
	})

	// Install Endpoint (Copy/Move to Library)
	mux.HandleFunc("/api/install", func(w http.ResponseWriter, r *http.Request) {
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
			destPath = activePath // Default to active library if not specified
		}

		// Security check: ensure source files are in allowed libraries?
		// CopyPackagesToLibrary reads from src.
		// We should validate sources are in s.libraries OR activePath.
		for _, src := range req.FilePaths {
			cleanSrc := strings.ToLower(filepath.Clean(src))
			allowed := false
			if strings.HasPrefix(cleanSrc, strings.ToLower(activePath)) {
				allowed = true
			} else {
				for _, lib := range s.libraries {
					if strings.HasPrefix(cleanSrc, strings.ToLower(lib)) {
						allowed = true
						break
					}
				}
			}
			if !allowed {
				s.writeError(w, fmt.Sprintf("Access denied: Source file %s not in allowed libraries", src), 403)
				return
			}
		}

		collisions, err := s.manager.CopyPackagesToLibrary(req.FilePaths, destPath, req.Overwrite)
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
	})

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
	mux.HandleFunc("/files/", func(w http.ResponseWriter, r *http.Request) {
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
		cleanTarget := strings.ToLower(filepath.Clean(targetFile))
		cleanActive := strings.ToLower(filepath.Clean(activePath))
		allowed := false

		// Check activePath first
		if strings.HasPrefix(cleanTarget, cleanActive) {
			allowed = true
		} else {
			// Check other libraries
			for _, lib := range s.libraries {
				cleanLib := strings.ToLower(filepath.Clean(lib))
				if strings.HasPrefix(cleanTarget, cleanLib) {
					allowed = true
					break
				}
			}
		}

		if !allowed {
			s.writeError(w, "Access denied: File not in allowed libraries", 403)
			return
		}

		http.ServeFile(w, r, targetFile)
	})

	mux.Handle("/", distFs)

	s.httpSrv = &http.Server{
		Addr:    ":" + port,
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
	s.log(fmt.Sprintf("Serving library from: %s", activePath))
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

	if err := s.httpSrv.Shutdown(ctx); err != nil {
		s.log(fmt.Sprintf("Error during shutdown: %v", err))
		return err
	}

	s.running = false
	s.log("Server stopped.")
	return nil
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
