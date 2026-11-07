package server

import (
	"encoding/json"
	"net/http"
	"testing"
	"yavam/pkg/services/auth"
	"yavam/pkg/services/config"
)

type deviceRecordingAuth struct {
	MockAuthService
	loginDeviceID  string
	redeemDeviceID string
	sessions       []auth.User
}

func (a *deviceRecordingAuth) HasCustomPassword() bool { return true }

func (a *deviceRecordingAuth) Login(username, password, deviceName, deviceID string) (string, error) {
	a.loginDeviceID = deviceID
	return a.MockAuthService.Login(username, password, deviceName, deviceID)
}

func (a *deviceRecordingAuth) RedeemPairingCode(code, deviceName, deviceID string) (string, error) {
	a.redeemDeviceID = deviceID
	return "paired-token", nil
}

func (a *deviceRecordingAuth) ListSessions() ([]auth.User, error) { return a.sessions, nil }

func TestLoginAndPairForwardDeviceID(t *testing.T) {
	recorder := &deviceRecordingAuth{MockAuthService: MockAuthService{validToken: "t"}}
	s, _ := startAuthServer(t, recorder, &config.Config{})

	login := `{"username":"admin","password":"password","deviceName":"phone","deviceId":"phone-device-id-0001"}`
	if w := do(s, http.MethodPost, "/api/auth/login", login, loopbackPeer, nil); w.Code != http.StatusOK {
		t.Fatalf("login: expected 200, got %d", w.Code)
	}
	if recorder.loginDeviceID != "phone-device-id-0001" {
		t.Errorf("login deviceId = %q", recorder.loginDeviceID)
	}

	pair := `{"code":"ABCD-2345","deviceName":"phone","deviceId":"tablet_device_id_0002"}`
	if w := do(s, http.MethodPost, "/api/auth/pair", pair, remotePeer, nil); w.Code != http.StatusOK {
		t.Fatalf("pair: expected 200, got %d", w.Code)
	}
	if recorder.redeemDeviceID != "tablet_device_id_0002" {
		t.Errorf("pair deviceId = %q", recorder.redeemDeviceID)
	}
}

func TestLoginWithoutDeviceIDStillWorks(t *testing.T) {
	recorder := &deviceRecordingAuth{MockAuthService: MockAuthService{validToken: "t"}}
	s, _ := startAuthServer(t, recorder, &config.Config{})

	if w := do(s, http.MethodPost, "/api/auth/login", loginBody, loopbackPeer, nil); w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if recorder.loginDeviceID != "" {
		t.Errorf("deviceId = %q, want empty", recorder.loginDeviceID)
	}
}

func TestSessionsEndpointExposesIsSystem(t *testing.T) {
	recorder := &deviceRecordingAuth{
		MockAuthService: MockAuthService{validToken: "t"},
		sessions: []auth.User{
			{ID: "a", Username: "system", DeviceName: "Local System", IsSystem: true},
			{ID: "b", Username: "admin", DeviceName: "Local System"},
		},
	}
	s, _ := startAuthServer(t, recorder, &config.Config{})

	w := do(s, http.MethodGet, "/api/auth/sessions", "", loopbackPeer, map[string]string{"Authorization": "Bearer t"})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var listed []map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	if len(listed) != 2 || listed[0]["isSystem"] != true || listed[1]["isSystem"] != false {
		t.Errorf("unexpected sessions payload: %v", listed)
	}
	if listed[1]["deviceName"] != "Local System" {
		t.Error("existing fields must be kept")
	}
}
