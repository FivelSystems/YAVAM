package server

import (
	"context"
	"net/http"
	"path/filepath"
	"testing"
	"yavam/pkg/manager"
	"yavam/pkg/services/config"
)

func startPublicAccessServer(t *testing.T, libraryDir string) *Server {
	t.Helper()
	cfg := &config.Config{Libraries: []string{libraryDir}, PublicAccess: true}
	mgr := manager.NewManager(nil, nil, &MockConfigService{config: cfg})
	s := NewServer(context.Background(), mgr, &MockAuthService{validToken: "valid"}, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true
	if err := s.Start("127.0.0.1", "0", nil); err != nil {
		t.Fatalf("Start() failed: %v", err)
	}
	t.Cleanup(func() { s.Stop() })
	return s
}

func TestGuestCannotDownloadFiles(t *testing.T) {
	libraryDir, _ := newLibraryAndOutsideDirs(t)
	packagePath := filepath.Join(libraryDir, "a.var")
	writeTestFile(t, packagePath, "package-bytes")
	s := startPublicAccessServer(t, libraryDir)
	route := "/files/?path=" + packagePath

	if w := do(s, http.MethodGet, route, "", remotePeer, nil); w.Code != http.StatusUnauthorized {
		t.Fatalf("guest: expected 401, got %d", w.Code)
	}

	w := do(s, http.MethodGet, route, "", remotePeer, map[string]string{"Authorization": "Bearer valid"})
	if w.Code != http.StatusOK || w.Body.String() != "package-bytes" {
		t.Fatalf("authenticated client: expected the file, got %d %q", w.Code, w.Body.String())
	}
}

func TestGuestKeepsTheReadOnlyRoutes(t *testing.T) {
	s := &Server{}
	allowed := []struct{ method, path string }{
		{http.MethodGet, "/api/packages"},
		{http.MethodGet, "/api/disk-space"},
		{http.MethodGet, "/api/config"},
		{http.MethodGet, "/api/thumbnail"},
		{http.MethodPost, "/api/contents"},
		{http.MethodPost, "/api/scan/collisions"},
	}
	for _, route := range allowed {
		if !s.isGuestAllowed(newTestRequest(route.method, route.path, nil)) {
			t.Errorf("%s %s should stay available to guests", route.method, route.path)
		}
	}

	denied := []struct{ method, path string }{
		{http.MethodGet, "/files/"},
		{http.MethodGet, "/files/?path=x"},
		{http.MethodPost, "/api/delete"},
		{http.MethodPost, "/api/toggle"},
		{http.MethodPost, "/api/upload"},
		{http.MethodGet, "/api/events"},
	}
	for _, route := range denied {
		if s.isGuestAllowed(newTestRequest(route.method, route.path, nil)) {
			t.Errorf("%s %s must not be available to guests", route.method, route.path)
		}
	}
}
