package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"varmanager/pkg/services/auth"
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

func TestAuthMiddleware(t *testing.T) {
	mockAuth := &MockAuthService{validToken: "valid-token"}
	// Create a dummy server struct with the mock auth
	srv := &Server{
		auth: mockAuth,
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
