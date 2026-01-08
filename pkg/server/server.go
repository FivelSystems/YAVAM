package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"varmanager/pkg/manager"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type Server struct {
	ctx      context.Context
	httpSrv  *http.Server
	running  bool
	mu       sync.Mutex
	logMutex sync.Mutex
	manager  *manager.Manager
}

func NewServer(ctx context.Context, m *manager.Manager) *Server {
	return &Server{
		ctx:     ctx,
		manager: m,
	}
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

// corsMiddleware allows all CORS requests - useful for local dev if needed, or just browser access
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

func (s *Server) Start(port string, path string) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return fmt.Errorf("server is already running")
	}
	s.mu.Unlock()

	// Check if path exists
	if path == "" {
		return fmt.Errorf("invalid path")
	}

	mux := http.NewServeMux()

	// API Endpoint
	mux.HandleFunc("/api/packages", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		res, err := s.manager.ScanAndAnalyze(path)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		json.NewEncoder(w).Encode(res.Packages)
	})

	// Config Endpoint (for frontend to know it's in web mode if needed, or share settings)
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"webMode": true,
			"path":    path,
		})
	})

	// Upload Endpoint
	mux.HandleFunc("/api/upload", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// 500MB max limit
		if err := r.ParseMultipartForm(500 << 20); err != nil {
			http.Error(w, "File too large", http.StatusBadRequest)
			return
		}

		files := r.MultipartForm.File["file"]
		// User requested root path
		downloadDir := path

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
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			FilePath string `json:"filePath"`
			Enable   bool   `json:"enable"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		newPath, err := s.manager.TogglePackage(nil, req.FilePath, req.Enable, path)
		if err != nil {
			s.log(fmt.Sprintf("Error toggling package: %v", err))
			http.Error(w, err.Error(), 500)
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
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			FilePath string `json:"filePath"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		// Security Check: Ensure file is within library path
		rel, err := filepath.Rel(path, req.FilePath)
		if err != nil || strings.HasPrefix(rel, "..") {
			http.Error(w, "Security violation: Invalid file path", 403)
			return
		}

		if err := s.manager.DeleteToTrash(req.FilePath); err != nil {
			s.log(fmt.Sprintf("Error deleting package: %v", err))
			http.Error(w, err.Error(), 500)
			return
		}

		s.log(fmt.Sprintf("Deleted package: %s", filepath.Base(req.FilePath)))
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
	})

	// Serve Frontend (Dist)
	// We assume frontend/dist is relative to the CWD of the executable or dev root.
	// In dev mode: c:\Users\ganndev\github\yavam
	// So frontend/dist is correct.
	distPath := filepath.Join("frontend", "dist")
	if _, err := os.Stat(distPath); os.IsNotExist(err) {
		s.log("Warning: frontend/dist not found. Web UI may not work.")
	}

	distFs := http.FileServer(http.Dir(distPath))

	// Handle SPA routing: if file not found, serve index.html
	// But simpler for now: just serve dist
	// And /files/ for the actual content

	// File Serving
	filesFs := http.FileServer(http.Dir(path))

	mux.Handle("/files/", http.StripPrefix("/files/", filesFs))

	// Static Assets
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
	s.log(fmt.Sprintf("Serving library from: %s", path))
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

// GetOutboundIP prefers the preferred outbound ip of this machine
func (s *Server) GetOutboundIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)

	return localAddr.IP.String()
}
