package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"yavam/pkg/manager"
	"yavam/pkg/services/auth"
	"yavam/pkg/services/config"
)

type MockAuthService struct {
	validToken string
}

func (m *MockAuthService) InitiateLogin(username string) (string, error) {
	return "mock-nonce", nil
}

func (m *MockAuthService) CompleteLogin(username, nonce, proof, deviceName string) (string, error) {
	return m.validToken, nil
}

func (m *MockAuthService) ValidateToken(token string) (*auth.User, error) {
	if token == m.validToken {
		return &auth.User{Username: "admin"}, nil
	}
	return nil, auth.ErrInvalidToken
}

func (m *MockAuthService) GenerateToken() (string, error) {
	return "new-token", nil
}

func (m *MockAuthService) RevokeToken(token string) {}

func (m *MockAuthService) SetPassword(newPassword string) error {
	return nil
}

func (m *MockAuthService) ListSessions() ([]auth.User, error) {
	return []auth.User{}, nil
}

func (m *MockAuthService) RevokeSession(id string) error {
	return nil
}

type MockConfigService struct {
	config *config.Config
}

func (m *MockConfigService) Load() (*config.Config, error) { return m.config, nil }
func (m *MockConfigService) Save(cfg *config.Config) error { return nil }
func (m *MockConfigService) Get() *config.Config           { return m.config }
func (m *MockConfigService) IsConfigured() bool            { return true }
func (m *MockConfigService) FinishSetup() error            { return nil }
func (m *MockConfigService) Update(fn func(*config.Config)) error {
	fn(m.config)
	return nil
}

func TestAuthMiddleware(t *testing.T) {
	mockAuth := &MockAuthService{validToken: "valid-token"}
	mockConfig := &MockConfigService{config: &config.Config{PublicAccess: false}}

	// Create partial manager with mock config
	mgr := &manager.Manager{}
	// We need to inject config into Manager.
	// Since Manager struct fields are private/public mixed, and we don't have a constructor here
	// that takes just config easily without other services, we might need to set it if accessible.
	// Initializing Manager via NewManager is complex.
	// But Manager.GetConfig() delegates to m.config.
	// We can't set m.config directly if it's private (it is "config" field).
	// We need to use NewManager or modify Manager to be more testable.
	// OR: We mock Manager? No, Manager is a struct.
	// Let's use unsafe/reflection or better: use NewManager with nil services but valid ConfigService.

	// Assuming NewManager(sys, lib, cfg)
	mgr = manager.NewManager(nil, nil, mockConfig)

	// Create a dummy server struct with the mock auth and manager
	srv := &Server{
		auth:    mockAuth,
		manager: mgr,
	}

	// Create a handler to wrap
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	protectedHandler := srv.AuthMiddleware(nextHandler)

	tests := []struct {
		name           string
		header         string
		query          string
		expectedStatus int
	}{
		{
			name:           "No Token",
			header:         "",
			query:          "",
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "Invalid Header Format",
			header:         "InvalidFormat",
			query:          "",
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "Invalid Token",
			header:         "Bearer invalid-token",
			query:          "",
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "Valid Header Token",
			header:         "Bearer valid-token",
			query:          "",
			expectedStatus: http.StatusOK,
		},
		{
			name:           "Valid Query Token",
			header:         "",
			query:          "valid-token",
			expectedStatus: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/protected", nil)
			if tt.header != "" {
				req.Header.Set("Authorization", tt.header)
			}
			if tt.query != "" {
				q := req.URL.Query()
				q.Add("token", tt.query)
				req.URL.RawQuery = q.Encode()
			}

			rec := httptest.NewRecorder()
			protectedHandler.ServeHTTP(rec, req)

			if rec.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, rec.Code)
			}
		})
	}
}
