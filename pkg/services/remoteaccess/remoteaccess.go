// Package remoteaccess holds the desktop-side controls for letting other
// devices reach the web server: the admin password, device pairing, the
// remote password login switch and the listening address.
package remoteaccess

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"yavam/pkg/services/auth"
	"yavam/pkg/services/config"
)

// Settings is the slice of the manager this service needs.
type Settings interface {
	GetConfig() *config.Config
	UpdateConfig(fn func(*config.Config)) error
	GetLibraries() []string
}

// WebServer is the slice of the HTTP server this service needs.
type WebServer interface {
	IsRunning() bool
	Start(bindHost, port string, libraries []string) error
	Stop() error
}

// Passwords is the slice of the auth service this service needs.
type Passwords interface {
	SetPassword(newPassword string) error
	HasCustomPassword() bool
	CreatePairingCode(ttl time.Duration) (auth.PairingCode, error)
	PairingStatus() auth.PairingStatus
}

// PairingState never carries the code. ExpiresAt is RFC 3339, empty when no
// code is active.
type PairingState struct {
	Active    bool   `json:"active"`
	ExpiresAt string `json:"expiresAt"`
}

// State is what the desktop UI shows about remote access.
type State struct {
	HasCustomPassword        bool         `json:"hasCustomPassword"`
	AllowRemotePasswordLogin bool         `json:"allowRemotePasswordLogin"`
	ServerBindAddress        string       `json:"serverBindAddress"`
	Pairing                  PairingState `json:"pairing"`
}

// PairingGrant is the only place a pairing code leaves the backend.
type PairingGrant struct {
	Code      string `json:"code"`
	ExpiresAt string `json:"expiresAt"`
}

// Service is safe for concurrent use.
type Service struct {
	settings  Settings
	server    WebServer
	passwords Passwords

	// mu keeps a bind address change and its server restart from interleaving.
	mu sync.Mutex
}

func NewService(settings Settings, server WebServer, passwords Passwords) *Service {
	return &Service{settings: settings, server: server, passwords: passwords}
}

func (s *Service) State() State {
	cfg := s.settings.GetConfig()
	pairing := s.passwords.PairingStatus()

	state := State{
		HasCustomPassword:        s.passwords.HasCustomPassword(),
		AllowRemotePasswordLogin: cfg.AllowRemotePasswordLogin,
		ServerBindAddress:        canonicalBindAddress(cfg.ServerBindAddress),
		Pairing:                  PairingState{Active: pairing.Active},
	}
	if pairing.Active {
		state.Pairing.ExpiresAt = formatTime(pairing.ExpiresAt)
	}
	return state
}

// CreatePairingCode issues a code with the default lifetime.
func (s *Service) CreatePairingCode() (PairingGrant, error) {
	code, err := s.passwords.CreatePairingCode(auth.DefaultPairingTTL)
	if err != nil {
		return PairingGrant{}, Describe(err)
	}
	return PairingGrant{Code: code.Code, ExpiresAt: formatTime(code.ExpiresAt)}, nil
}

// SetAdminPassword applies the password rules and describes a rejection in
// words the UI can show as is.
func (s *Service) SetAdminPassword(password string) error {
	return Describe(s.passwords.SetPassword(password))
}

func (s *Service) SetAllowRemotePasswordLogin(allowed bool) error {
	return s.settings.UpdateConfig(func(cfg *config.Config) {
		cfg.AllowRemotePasswordLogin = allowed
	})
}

// SetServerBindAddress validates and persists the address, then rebinds a
// running server. When the rebind fails the server is left stopped: the old
// listener is already closed, and silently keeping the previous exposure
// would defeat the change.
func (s *Service) SetServerBindAddress(value string) error {
	if err := config.ValidateBindAddress(value); err != nil {
		return Describe(err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.settings.UpdateConfig(func(cfg *config.Config) {
		cfg.ServerBindAddress = value
	}); err != nil {
		return err
	}
	if !s.server.IsRunning() {
		return nil
	}
	return s.restartServer()
}

func (s *Service) restartServer() error {
	if err := s.server.Stop(); err != nil && s.server.IsRunning() {
		return fmt.Errorf("could not stop the server to apply the new address: %w", err)
	}

	cfg := s.settings.GetConfig()
	host := config.ResolveBindHost(cfg.ServerBindAddress)
	if err := s.server.Start(host, cfg.ListenPort(), s.settings.GetLibraries()); err != nil {
		return &UserError{
			message: fmt.Sprintf("The address was saved but the server could not restart on it and is now stopped: %v", err),
			cause:   err,
		}
	}
	return nil
}

func canonicalBindAddress(value string) string {
	if value == "" {
		return config.BindAll
	}
	return value
}

func formatTime(moment time.Time) string {
	return moment.UTC().Format(time.RFC3339)
}

// UserError carries a message written for the person at the desktop while
// keeping the original error reachable through errors.Is.
type UserError struct {
	message string
	cause   error
}

func (e *UserError) Error() string { return e.message }
func (e *UserError) Unwrap() error { return e.cause }

// Describe rewrites the known rejections of the auth and config packages as
// sentences for the UI and passes every other error through untouched.
func Describe(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, auth.ErrPasswordTooShort):
		return &UserError{message: fmt.Sprintf("The password must be at least %d characters long.", auth.MinPasswordLength), cause: err}
	case errors.Is(err, auth.ErrPasswordIsDefault):
		return &UserError{message: "Choose a password other than the default one.", cause: err}
	case errors.Is(err, auth.ErrAdminPasswordNotSet):
		return &UserError{message: "Set an administrator password before pairing devices.", cause: err}
	case errors.Is(err, config.ErrInvalidBindAddress):
		return &UserError{message: "Choose all interfaces, this computer only, or the address of one of this computer's network interfaces.", cause: err}
	default:
		return err
	}
}
