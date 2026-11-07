package remoteaccess

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"yavam/pkg/services/auth"
	"yavam/pkg/services/config"
)

const strongPassword = "correct-horse-battery"

type testSettings struct {
	config    config.ConfigService
	libraries []string
}

func (s *testSettings) GetConfig() *config.Config { return s.config.Get() }
func (s *testSettings) UpdateConfig(fn func(*config.Config)) error {
	return s.config.Update(fn)
}
func (s *testSettings) GetLibraries() []string { return s.libraries }

type startCall struct {
	host      string
	port      string
	libraries []string
}

type fakeServer struct {
	running  bool
	stopErr  error
	startErr error
	events   []string
	starts   []startCall
}

func (f *fakeServer) IsRunning() bool { return f.running }

func (f *fakeServer) Stop() error {
	f.events = append(f.events, "stop")
	if f.stopErr != nil {
		return f.stopErr
	}
	f.running = false
	return nil
}

func (f *fakeServer) Start(bindHost, port string, libraries []string) error {
	f.events = append(f.events, "start")
	f.starts = append(f.starts, startCall{bindHost, port, libraries})
	if f.startErr != nil {
		return f.startErr
	}
	f.running = true
	return nil
}

type fixture struct {
	service  *Service
	settings *testSettings
	server   *fakeServer
	auth     *auth.SimpleTokenAuthService
	clock    time.Time
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	configService, err := config.NewFileConfigService(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	clock := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	authService, err := auth.NewSimpleAuthServiceWithClock(filepath.Join(t.TempDir(), "auth.json"), func() time.Time { return clock })
	if err != nil {
		t.Fatal(err)
	}
	settings := &testSettings{config: configService, libraries: []string{"library-one"}}
	server := &fakeServer{}
	return &fixture{
		service:  NewService(settings, server, authService),
		settings: settings,
		server:   server,
		auth:     authService,
		clock:    clock,
	}
}

func TestStateWithoutPasswordOrPairing(t *testing.T) {
	f := newFixture(t)

	state := f.service.State()

	if state.HasCustomPassword || state.AllowRemotePasswordLogin || state.Pairing.Active || state.Pairing.ExpiresAt != "" {
		t.Errorf("fresh install must report everything off: %+v", state)
	}
	if state.ServerBindAddress != config.BindAll {
		t.Errorf("unset bind address must read as %q, got %q", config.BindAll, state.ServerBindAddress)
	}
}

func TestStateReflectsPasswordFlagAndPairing(t *testing.T) {
	f := newFixture(t)
	if err := f.service.SetAdminPassword(strongPassword); err != nil {
		t.Fatal(err)
	}
	if err := f.service.SetAllowRemotePasswordLogin(true); err != nil {
		t.Fatal(err)
	}
	grant, err := f.service.CreatePairingCode()
	if err != nil {
		t.Fatal(err)
	}

	state := f.service.State()

	if !state.HasCustomPassword || !state.AllowRemotePasswordLogin || !state.Pairing.Active {
		t.Errorf("unexpected state: %+v", state)
	}
	if state.Pairing.ExpiresAt != grant.ExpiresAt {
		t.Errorf("state expiry %q must match the grant %q", state.Pairing.ExpiresAt, grant.ExpiresAt)
	}
	wantExpiry := f.clock.Add(auth.DefaultPairingTTL).Format(time.RFC3339)
	if grant.ExpiresAt != wantExpiry {
		t.Errorf("grant expiry %q, want %q", grant.ExpiresAt, wantExpiry)
	}
}

func TestStateNeverExposesTheCode(t *testing.T) {
	f := newFixture(t)
	f.service.SetAdminPassword(strongPassword)
	grant, err := f.service.CreatePairingCode()
	if err != nil {
		t.Fatal(err)
	}

	rendered := strings.ToUpper(strings.ReplaceAll(strings.Join([]string{
		f.service.State().Pairing.ExpiresAt, f.service.State().ServerBindAddress,
	}, " "), "-", ""))
	if strings.Contains(rendered, strings.ReplaceAll(grant.Code, "-", "")) {
		t.Fatal("state must not carry the pairing code")
	}
}

func TestCreatePairingCodeRefusedWhileDefaultPassword(t *testing.T) {
	f := newFixture(t)

	_, err := f.service.CreatePairingCode()

	if !errors.Is(err, auth.ErrAdminPasswordNotSet) {
		t.Fatalf("got %v, want ErrAdminPasswordNotSet", err)
	}
	if !strings.Contains(err.Error(), "Set an administrator password") {
		t.Errorf("message must tell the user what to do: %q", err.Error())
	}
}

func TestSetAdminPasswordDescribesRejections(t *testing.T) {
	f := newFixture(t)

	cases := []struct {
		password string
		sentinel error
		contains string
	}{
		{"short", auth.ErrPasswordTooShort, "at least 8 characters"},
		{"admin", auth.ErrPasswordIsDefault, "other than the default"},
	}
	for _, tc := range cases {
		err := f.service.SetAdminPassword(tc.password)
		if !errors.Is(err, tc.sentinel) {
			t.Errorf("%q: got %v, want %v", tc.password, err, tc.sentinel)
			continue
		}
		if !strings.Contains(err.Error(), tc.contains) {
			t.Errorf("%q: message %q must contain %q", tc.password, err.Error(), tc.contains)
		}
	}
	if f.auth.HasCustomPassword() {
		t.Error("a rejected password must leave the default in place")
	}
	if err := f.service.SetAdminPassword(strongPassword); err != nil {
		t.Fatalf("valid password: %v", err)
	}
}

func TestSetAllowRemotePasswordLoginPersists(t *testing.T) {
	f := newFixture(t)

	if err := f.service.SetAllowRemotePasswordLogin(true); err != nil {
		t.Fatal(err)
	}
	if !f.settings.GetConfig().AllowRemotePasswordLogin {
		t.Error("flag must be stored")
	}
	if err := f.service.SetAllowRemotePasswordLogin(false); err != nil {
		t.Fatal(err)
	}
	if f.settings.GetConfig().AllowRemotePasswordLogin {
		t.Error("flag must be cleared")
	}
}

func TestInvalidBindAddressIsRejectedAndNothingChanges(t *testing.T) {
	f := newFixture(t)
	f.server.running = true
	f.settings.UpdateConfig(func(c *config.Config) { c.ServerBindAddress = config.BindLoopback })

	for _, value := range []string{"evil.example.com", "203.0.113.77", "0.0.0.0/0", " all"} {
		err := f.service.SetServerBindAddress(value)
		if !errors.Is(err, config.ErrInvalidBindAddress) {
			t.Errorf("%q: got %v, want ErrInvalidBindAddress", value, err)
		}
	}

	if got := f.settings.GetConfig().ServerBindAddress; got != config.BindLoopback {
		t.Errorf("a rejected value must not be stored, config holds %q", got)
	}
	if len(f.server.events) != 0 {
		t.Errorf("a rejected value must not touch the server: %v", f.server.events)
	}
}

func TestBindAddressChangeWhileStoppedOnlyPersists(t *testing.T) {
	f := newFixture(t)

	if err := f.service.SetServerBindAddress(config.BindLoopback); err != nil {
		t.Fatal(err)
	}

	if got := f.settings.GetConfig().ServerBindAddress; got != config.BindLoopback {
		t.Errorf("stored %q, want loopback", got)
	}
	if len(f.server.events) != 0 {
		t.Errorf("a stopped server must stay stopped: %v", f.server.events)
	}
}

func TestBindAddressChangeRestartsARunningServer(t *testing.T) {
	f := newFixture(t)
	f.server.running = true
	f.settings.UpdateConfig(func(c *config.Config) { c.ServerPort = "19999" })

	if err := f.service.SetServerBindAddress(config.BindLoopback); err != nil {
		t.Fatal(err)
	}

	if strings.Join(f.server.events, ",") != "stop,start" {
		t.Fatalf("expected stop then start, got %v", f.server.events)
	}
	want := startCall{host: "127.0.0.1", port: "19999", libraries: []string{"library-one"}}
	got := f.server.starts[0]
	if got.host != want.host || got.port != want.port || strings.Join(got.libraries, ",") != "library-one" {
		t.Errorf("restart used %+v, want %+v", got, want)
	}
	if !f.server.running {
		t.Error("server must be running after a successful restart")
	}
}

func TestRestartUsesDefaultPortWhenUnset(t *testing.T) {
	f := newFixture(t)
	f.server.running = true
	f.settings.UpdateConfig(func(c *config.Config) { c.ServerPort = "" })

	if err := f.service.SetServerBindAddress(config.BindAll); err != nil {
		t.Fatal(err)
	}
	if got := f.server.starts[0]; got.host != "0.0.0.0" || got.port != config.DefaultServerPort {
		t.Errorf("restart used %+v", got)
	}
}

func TestFailedRestartLeavesTheServerStoppedAndReportsIt(t *testing.T) {
	f := newFixture(t)
	f.server.running = true
	bindFailure := errors.New("listen tcp: address already in use")
	f.server.startErr = bindFailure

	err := f.service.SetServerBindAddress(config.BindLoopback)

	if !errors.Is(err, bindFailure) {
		t.Fatalf("got %v, want the bind failure", err)
	}
	if !strings.Contains(err.Error(), "now stopped") {
		t.Errorf("message must say the server is stopped: %q", err.Error())
	}
	if f.server.running {
		t.Error("the server must not keep running on the old address")
	}
	if got := f.settings.GetConfig().ServerBindAddress; got != config.BindLoopback {
		t.Errorf("the chosen address stays saved so the next start honours it, got %q", got)
	}
}

func TestStopFailureThatLeavesTheServerRunningIsReported(t *testing.T) {
	f := newFixture(t)
	f.server.running = true
	f.server.stopErr = errors.New("stuck")

	err := f.service.SetServerBindAddress(config.BindLoopback)

	if err == nil || !errors.Is(err, f.server.stopErr) {
		t.Fatalf("got %v, want the stop failure", err)
	}
	if len(f.server.starts) != 0 {
		t.Error("must not start a second listener while the first is still running")
	}
}

func TestDescribePassesUnknownErrorsThrough(t *testing.T) {
	original := errors.New("disk full")
	if Describe(original) != original {
		t.Error("unknown errors must pass through unchanged")
	}
	if Describe(nil) != nil {
		t.Error("nil must stay nil")
	}
}
