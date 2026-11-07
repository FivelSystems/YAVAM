package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"unicode/utf8"
	"yavam/pkg/services/auth"
	"yavam/pkg/utils"
)

const (
	maxPairingDeviceNameLength = 64
	maxPairingCodeInputLength  = 32

	messageAdminPasswordNotSet = "Set an administrator password from the desktop app first"
	messagePasswordLoginRemote = "Password login is disabled for remote devices. Pair this device with a code from the desktop app"
	messageInvalidPairingCode  = "Invalid or expired code"
	messagePairingFailed       = "Pairing failed"
)

// isLoopbackRequest judges the TCP peer only. Forwarding headers are
// attacker-controlled, so they are deliberately never consulted.
func isLoopbackRequest(r *http.Request) bool {
	host := r.RemoteAddr
	if splitHost, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		host = splitHost
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (s *Server) remotePasswordLoginAllowed() bool {
	if s.manager == nil {
		return false
	}
	return s.manager.GetConfig().AllowRemotePasswordLogin
}

// rejectPasswordLogin writes the refusal and returns true when the password
// login gates deny this request: no administrator password has been set, or
// the client is remote while remote password login is off.
func (s *Server) rejectPasswordLogin(w http.ResponseWriter, r *http.Request) bool {
	if !s.auth.HasCustomPassword() {
		s.writeError(w, messageAdminPasswordNotSet, http.StatusServiceUnavailable)
		return true
	}
	if !isLoopbackRequest(r) && !s.remotePasswordLoginAllowed() {
		s.writeError(w, messagePasswordLoginRemote, http.StatusForbidden)
		return true
	}
	return false
}

// handleAuthPair redeems a one-time pairing code. Wrong, expired, used and
// absent codes share one response so the endpoint reveals nothing about them.
func (s *Server) handleAuthPair(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.auth == nil {
		s.writeError(w, "Auth service not initialized", http.StatusInternalServerError)
		return
	}
	if !s.auth.HasCustomPassword() {
		s.writeError(w, messageAdminPasswordNotSet, http.StatusServiceUnavailable)
		return
	}

	var req struct {
		Code       string `json:"code"`
		DeviceName string `json:"deviceName"`
	}
	if !s.decodeJSONBody(w, r, &req) {
		return
	}
	if req.Code == "" || len(req.Code) > maxPairingCodeInputLength ||
		utf8.RuneCountInString(req.DeviceName) > maxPairingDeviceNameLength {
		s.writeError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	token, err := s.auth.RedeemPairingCode(req.Code, req.DeviceName)
	switch {
	case err == nil:
		s.log(fmt.Sprintf("Device %s paired successfully", utils.SanitizeForLog(req.DeviceName)))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"token":   token,
		})
	case errors.Is(err, auth.ErrInvalidPairingCode):
		s.log(fmt.Sprintf("Pairing rejected for device %s", utils.SanitizeForLog(req.DeviceName)))
		s.writeError(w, messageInvalidPairingCode, http.StatusUnauthorized)
	case errors.Is(err, auth.ErrAdminPasswordNotSet):
		s.writeError(w, messageAdminPasswordNotSet, http.StatusServiceUnavailable)
	default:
		s.log(fmt.Sprintf("Pairing failed for device %s: session could not be saved", utils.SanitizeForLog(req.DeviceName)))
		s.writeError(w, messagePairingFailed, http.StatusInternalServerError)
	}
}

// handleAuthStatus tells the web client, before login, which sign-in options
// exist. It returns booleans only: never the code, its expiry or any secret.
func (s *Server) handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.auth == nil {
		s.writeError(w, "Auth service not initialized", http.StatusInternalServerError)
		return
	}

	passwordSet := s.auth.HasCustomPassword()
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(map[string]bool{
		"setupRequired":        !passwordSet,
		"passwordLoginAllowed": s.remotePasswordLoginAllowed() || isLoopbackRequest(r),
		"pairingAvailable":     passwordSet,
	})
}
