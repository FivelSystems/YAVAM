package server

import (
	"context"
	"embed"
	"encoding/json"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"yavam/pkg/manager"
	"yavam/pkg/services/config"
)

// Mock assets
var mockAssets embed.FS

// Note: MockAuthService is available from middleware_test.go (same package)

// Mock Config Service for Server Tests (Unique Name)
type TestServerConfigService struct {
	libraries []string
	setupDone bool
}

func (m *TestServerConfigService) Load() (*config.Config, error) {
	return &config.Config{Libraries: m.libraries, SetupDone: m.setupDone}, nil
}
func (m *TestServerConfigService) Save(cfg *config.Config) error { return nil }
func (m *TestServerConfigService) Get() *config.Config {
	return &config.Config{Libraries: m.libraries, SetupDone: m.setupDone}
}
func (m *TestServerConfigService) IsConfigured() bool                   { return m.setupDone }
func (m *TestServerConfigService) FinishSetup() error                   { return nil }
func (m *TestServerConfigService) Update(fn func(*config.Config)) error { return nil }

func TestStartServer(t *testing.T) {
	// We can pass nil manager because Start() doesn't use it, only handlers do.
	// We just want to test the Start() logic itself (ports, running state)

	// Mock Auth
	mockAuth := &MockAuthService{validToken: "valid"}

	// Note: We pass nil manager here as we don't call handlers
	s := NewServer(context.Background(), nil, mockAuth, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true

	// Test 1: Start with valid path (Port 0 = Random Free Port)
	err := s.Start("127.0.0.1", "0", []string{"C:/tmp"})
	if err != nil {
		t.Fatalf("Start() failed with valid path: %v", err)
	}
	if !s.IsRunning() {
		t.Error("Server should be running")
	}

	// Test 2: Start again should fail
	err = s.Start("127.0.0.1", "0", nil)
	if err == nil || err.Error() != "server is already running" {
		t.Error("Start() should fail if already running")
	}

	// Test 3: Stop
	err = s.Stop()
	if err != nil {
		t.Fatalf("Stop() failed: %v", err)
	}

	if s.IsRunning() {
		t.Error("Server should not be running after Stop()")
	}

	// Test 4: Stop again (should be safe)
	err = s.Stop()
	if err != nil {
		t.Errorf("Stop() repeated should not error: %v", err)
	}
}

func TestStartServer_EmptyPath(t *testing.T) {
	mockAuth := &MockAuthService{validToken: "valid"}
	s := NewServer(context.Background(), nil, mockAuth, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true

	// Test 2: Start with empty path (Should succeed now)
	err := s.Start("127.0.0.1", "0", []string{})
	if err != nil {
		t.Fatalf("Start() failed with empty path: %v", err)
	}
}

func TestAPI_EmptyPathSecurity(t *testing.T) {
	mockAuth := &MockAuthService{validToken: "valid"}

	// Create Manager with Mock Config (Empty Libraries)
	mgr := manager.NewManager(nil, nil, &TestServerConfigService{libraries: []string{}})

	s := NewServer(context.Background(), mgr, mockAuth, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true

	// Start with empty path
	s.Start("127.0.0.1", "0", []string{})

	// Construct Request to /api/packages
	req := newTestRequest("GET", "/api/packages", nil)
	// Add Auth Token (to bypass auth middleware)
	req.Header.Set("Authorization", "Bearer valid")

	w := httptest.NewRecorder()

	if s.httpSrv == nil || s.httpSrv.Handler == nil {
		t.Fatal("Server handler not initialized")
	}

	s.httpSrv.Handler.ServeHTTP(w, req)

	// Expect 400 Bad Request (No library path selected)
	if w.Code != 400 {
		t.Errorf("Expected 400 Bad Request for empty path, got %d. Body: %s", w.Code, w.Body.String())
	}

	if !strings.Contains(w.Body.String(), "No library path selected") {
		t.Errorf("Expected error message about library path, got: %s", w.Body.String())
	}
}

func TestAPI_ExplicitPathSecurity(t *testing.T) {
	mockAuth := &MockAuthService{validToken: "valid"}

	// Create Manager with Mock Config (Allowed Library)
	mgr := manager.NewManager(nil, nil, &TestServerConfigService{libraries: []string{"C:/Allowed"}})

	s := NewServer(context.Background(), mgr, mockAuth, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true

	// Start with allowed path
	s.Start("127.0.0.1", "0", []string{"C:/Allowed"})

	// Let's test blocking of unsafe path
	req := newTestRequest("GET", "/api/packages?path=C:/Secrets", nil)
	req.Header.Set("Authorization", "Bearer valid")
	w := httptest.NewRecorder()

	s.httpSrv.Handler.ServeHTTP(w, req)

	// Should be 403 Forbidden
	if w.Code != 403 {
		t.Errorf("Expected 403 Forbidden for unsafe path, got %d", w.Code)
	}
}
func TestAPI_Config_SetupDone(t *testing.T) {
	mockAuth := &MockAuthService{validToken: "valid"}
	
	// Mock config with SetupDone = true
	cfgSvc := &TestServerConfigService{libraries: []string{"C:/Allowed"}, setupDone: true}
	mgr := manager.NewManager(nil, nil, cfgSvc)

	s := NewServer(context.Background(), mgr, mockAuth, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true
	s.Start("127.0.0.1", "0", []string{"C:/Allowed"})

	req := newTestRequest("GET", "/api/config", nil)
	req.Header.Set("Authorization", "Bearer valid")
	w := httptest.NewRecorder()

	s.httpSrv.Handler.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("Expected 200 OK, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if val, ok := resp["setupDone"]; !ok || val != true {
		t.Errorf("Expected setupDone: true in response, got: %v", resp["setupDone"])
	}

	// /api/config reports the DB-backed library list (manager.GetLibraries()),
	// matching the desktop bridge's App.GetConfig — not the config service's own
	// (stale, pre-SQLite-migration) Libraries field. The DB is shared across this
	// whole test binary run (one YAVAM_DATA_DIR for the package), so other tests'
	// libraries accumulate alongside this one's; assert presence, not exclusivity.
	libs, ok := resp["libraries"].([]interface{})
	if !ok {
		t.Fatalf("Expected libraries to be a list in response, got: %v", resp["libraries"])
	}
	found := false
	for _, lib := range libs {
		if lib == "C:/Allowed" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("Expected libraries to contain C:/Allowed, got: %v", resp["libraries"])
	}
}

func newTestServerWithManager(t *testing.T) *Server {
	t.Helper()
	mockAuth := &MockAuthService{validToken: "valid"}
	cfgSvc := &TestServerConfigService{libraries: []string{"C:/Allowed"}, setupDone: true}
	mgr := manager.NewManager(nil, nil, cfgSvc)

	s := NewServer(context.Background(), mgr, mockAuth, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true
	s.Start("127.0.0.1", "0", []string{"C:/Allowed"})
	return s
}

func postJSONRaw(t *testing.T, s *Server, path string, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := newTestRequest("POST", path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer valid")
	w := httptest.NewRecorder()
	s.httpSrv.Handler.ServeHTTP(w, req)
	return w
}

func TestAPI_PackageRating_OutOfRange(t *testing.T) {
	s := newTestServerWithManager(t)

	for _, rating := range []int{6, -1} {
		w := postJSONRaw(t, s, "/api/package-rating", `{"family":"Creator.Package","rating":`+strconv.Itoa(rating)+`}`)
		if w.Code != 400 {
			t.Errorf("rating %d: expected 400, got %d. Body: %s", rating, w.Code, w.Body.String())
		}
	}
}

func TestAPI_PackageRating_EmptyFamily(t *testing.T) {
	s := newTestServerWithManager(t)

	w := postJSONRaw(t, s, "/api/package-rating", `{"family":"","rating":3}`)
	if w.Code != 400 {
		t.Errorf("Expected 400 for empty family, got %d. Body: %s", w.Code, w.Body.String())
	}
}

func TestAPI_PackageRating_HappyPath(t *testing.T) {
	s := newTestServerWithManager(t)

	w := postJSONRaw(t, s, "/api/package-rating", `{"family":"Creator.Package","rating":4}`)
	if w.Code != 200 {
		t.Fatalf("Expected 200 OK, got %d. Body: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}
	if resp["success"] != true {
		t.Errorf("Expected success: true, got: %v", resp)
	}
}

func TestAPI_PackageFavorite_EmptyFamily(t *testing.T) {
	s := newTestServerWithManager(t)

	w := postJSONRaw(t, s, "/api/package-favorite", `{"family":"","favorite":true}`)
	if w.Code != 400 {
		t.Errorf("Expected 400 for empty family, got %d. Body: %s", w.Code, w.Body.String())
	}
}

func TestAPI_PackageFavorite_HappyPath(t *testing.T) {
	s := newTestServerWithManager(t)

	w := postJSONRaw(t, s, "/api/package-favorite", `{"family":"Creator.Package","favorite":true}`)
	if w.Code != 200 {
		t.Fatalf("Expected 200 OK, got %d. Body: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}
	if resp["success"] != true {
		t.Errorf("Expected success: true, got: %v", resp)
	}
}
