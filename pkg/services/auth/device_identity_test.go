package auth

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

const (
	deviceIDPhone  = "phone-device-id-0001"
	deviceIDTablet = "tablet_device_id_0002"
)

func loginWithID(t *testing.T, svc *SimpleTokenAuthService, name, deviceID string) string {
	t.Helper()
	token, err := svc.Login("admin", testPassword, name, deviceID)
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	return token
}

func TestSanitizeDeviceNameReservesSystemName(t *testing.T) {
	for _, name := range []string{
		"Local System", "local system", "LOCAL SYSTEM", "  Local System  ", "Local   System", "Local\u00a0System",
		"Local \u200bSystem", "Local\u202e System", "Local Sys\u2060tem", "\u200eLocal System",
	} {
		if got := sanitizeDeviceName(name, defaultDeviceName); got != defaultDeviceName {
			t.Errorf("%q: got %q, want the fallback", name, got)
		}
	}
	if got := sanitizeDeviceName("Local System 2", defaultDeviceName); got != "Local System 2" {
		t.Errorf("a different name must be kept, got %q", got)
	}
}

func TestSanitizeDeviceNameStripsFormatCharacters(t *testing.T) {
	cases := map[string]string{
		"Pho\u200bne":          "Phone",
		"\u202eenohP":          "enohP",
		"Ta\u2066b\u2069let":   "Tablet",
		"a\u2028b\u2029c":      "abc",
		"\u200b\u200c\u200d":   defaultDeviceName,
		"caf\u00e9 \u2764":     "caf\u00e9 \u2764",
		"\ufeffBOM at the top": "BOM at the top",
	}
	for input, want := range cases {
		if got := sanitizeDeviceName(input, defaultDeviceName); got != want {
			t.Errorf("%q: got %q, want %q", input, got, want)
		}
	}
}

func TestLoginAndPairingNeverStoreReservedName(t *testing.T) {
	svc, _ := newPairingService(t)

	user, err := svc.CheckToken(loginToken(t, svc, "local system"))
	if err != nil {
		t.Fatal(err)
	}
	if user.DeviceName != defaultDeviceName {
		t.Errorf("login stored %q", user.DeviceName)
	}

	token, err := svc.RedeemPairingCode(issueCode(t, svc).Code, "LOCAL\u200b SYSTEM", "")
	if err != nil {
		t.Fatal(err)
	}
	paired, _ := svc.CheckToken(token)
	if paired.DeviceName != pairedDeviceName {
		t.Errorf("pairing stored %q", paired.DeviceName)
	}
}

func TestSessionsAreNotDeduplicatedByDeviceName(t *testing.T) {
	svc, _, _ := newClockedService(t)
	first := loginToken(t, svc, "phone")
	second := loginToken(t, svc, "phone")

	assertSessionValidity(t, svc, first, true, "first session with the same name")
	assertSessionValidity(t, svc, second, true, "second session with the same name")
	if sessions, _ := svc.ListSessions(); len(sessions) != 2 {
		t.Errorf("sessions = %d, want 2", len(sessions))
	}
}

func TestPairedSessionsAreNotDeduplicatedByDeviceName(t *testing.T) {
	svc, _ := newPairingService(t)
	first, err := svc.RedeemPairingCode(issueCode(t, svc).Code, "tablet", "")
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.RedeemPairingCode(issueCode(t, svc).Code, "tablet", "")
	if err != nil {
		t.Fatal(err)
	}
	assertSessionValidity(t, svc, first, true, "first paired session")
	assertSessionValidity(t, svc, second, true, "second paired session")
}

func TestLoginWithSameDeviceIDReplacesOnlyThatDevice(t *testing.T) {
	svc, _, _ := newClockedService(t)
	oldPhone := loginWithID(t, svc, "phone", deviceIDPhone)
	tablet := loginWithID(t, svc, "tablet", deviceIDTablet)
	sameNameNoID := loginToken(t, svc, "phone")

	newPhone := loginWithID(t, svc, "renamed phone", deviceIDPhone)

	assertSessionValidity(t, svc, oldPhone, false, "replaced session")
	assertSessionValidity(t, svc, newPhone, true, "new session")
	assertSessionValidity(t, svc, tablet, true, "other device")
	assertSessionValidity(t, svc, sameNameNoID, true, "same name without an ID")
}

func TestPairingWithSameDeviceIDReplacesOnlyThatDevice(t *testing.T) {
	svc, _ := newPairingService(t)
	first, err := svc.RedeemPairingCode(issueCode(t, svc).Code, "phone", deviceIDPhone)
	if err != nil {
		t.Fatal(err)
	}
	other, err := svc.RedeemPairingCode(issueCode(t, svc).Code, "phone", deviceIDTablet)
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.RedeemPairingCode(issueCode(t, svc).Code, "phone", deviceIDPhone)
	if err != nil {
		t.Fatal(err)
	}
	assertSessionValidity(t, svc, first, false, "replaced paired session")
	assertSessionValidity(t, svc, second, true, "new paired session")
	assertSessionValidity(t, svc, other, true, "other device")
}

func TestDeviceIDNeverReplacesTheSystemSession(t *testing.T) {
	svc, _, _ := newClockedService(t)
	systemToken, err := svc.GenerateToken()
	if err != nil {
		t.Fatal(err)
	}
	loginWithID(t, svc, "x", deviceIDPhone)
	loginWithID(t, svc, "x", deviceIDPhone)
	assertSessionValidity(t, svc, systemToken, true, "system session")
}

func TestInvalidDeviceIDIsIgnored(t *testing.T) {
	invalid := []string{
		"short", strings.Repeat("a", minDeviceIDLength-1), strings.Repeat("a", maxDeviceIDLength+1),
		"has space in it 123456", "semi;colon;1234567890", "unicode-\u00e9-1234567890", "slash/slash/1234567890", "new\nline-1234567890",
	}
	for _, deviceID := range invalid {
		svc, _, _ := newClockedService(t)
		first := loginWithID(t, svc, "phone", deviceID)
		second := loginWithID(t, svc, "phone", deviceID)
		assertSessionValidity(t, svc, first, true, "first session with invalid ID "+deviceID)
		assertSessionValidity(t, svc, second, true, "second session with invalid ID "+deviceID)
		for _, stored := range svc.sessions {
			if stored.DeviceID != "" {
				t.Errorf("invalid ID %q was stored as %q", deviceID, stored.DeviceID)
			}
		}
	}
}

func TestDeviceIDBoundaries(t *testing.T) {
	for _, valid := range []string{strings.Repeat("a", minDeviceIDLength), strings.Repeat("Z9_-", maxDeviceIDLength/4)} {
		if sanitizeDeviceID(valid) != valid {
			t.Errorf("%q should be valid", valid)
		}
	}
}

func TestDeviceIDIsPersistedAndSurvivesReload(t *testing.T) {
	svc, clock, path := newClockedService(t)
	old := loginWithID(t, svc, "phone", deviceIDPhone)

	reloaded, err := NewSimpleAuthServiceWithClock(path, clock.Now)
	if err != nil {
		t.Fatal(err)
	}
	fresh, err := reloaded.Login("admin", testPassword, "phone", deviceIDPhone)
	if err != nil {
		t.Fatal(err)
	}
	assertSessionValidity(t, reloaded, old, false, "replaced across a restart")
	assertSessionValidity(t, reloaded, fresh, true, "new session")
}

func TestIsSystemOnlyForTheInternalSession(t *testing.T) {
	svc, _, _ := newClockedService(t)
	if _, err := svc.GenerateToken(); err != nil {
		t.Fatal(err)
	}
	loginToken(t, svc, localSystemDevice)
	loginToken(t, svc, "phone")
	pairingService, _ := newPairingService(t)
	if _, err := pairingService.RedeemPairingCode(issueCode(t, pairingService).Code, "Local System", ""); err != nil {
		t.Fatal(err)
	}

	sessions, _ := svc.ListSessions()
	systemCount := 0
	for _, session := range sessions {
		if session.IsSystem {
			systemCount++
			if session.Username != systemSessionUsername || session.DeviceName != localSystemDevice {
				t.Errorf("unexpected system session %+v", session)
			}
		}
	}
	if systemCount != 1 || len(sessions) != 3 {
		t.Errorf("system sessions = %d of %d, want 1 of 3", systemCount, len(sessions))
	}
	paired, _ := pairingService.ListSessions()
	for _, session := range paired {
		if session.IsSystem {
			t.Errorf("a paired device must never be system: %+v", session)
		}
	}
}

func TestSessionInfoJSONFieldNames(t *testing.T) {
	svc, _, _ := newClockedService(t)
	if _, err := svc.GenerateToken(); err != nil {
		t.Fatal(err)
	}
	loginWithID(t, svc, "phone", deviceIDPhone)
	sessions, _ := svc.ListSessions()

	encoded, err := json.Marshal(sessions)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(encoded), `"isSystem":true`) || !strings.Contains(string(encoded), `"isSystem":false`) {
		t.Errorf("isSystem missing from %s", encoded)
	}
	if strings.Contains(string(encoded), deviceIDPhone) || strings.Contains(strings.ToLower(string(encoded)), "deviceid") {
		t.Errorf("the device identifier must not be listed: %s", encoded)
	}
}

func TestAuthFileWithoutDeviceIDStillLoads(t *testing.T) {
	svc, clock, path := newClockedService(t)
	old := loginToken(t, svc, "phone")

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "deviceId") {
		t.Fatalf("a session without an ID must not write the key: %s", data)
	}

	reloaded, err := NewSimpleAuthServiceWithClock(path, clock.Now)
	if err != nil {
		t.Fatal(err)
	}
	assertSessionValidity(t, reloaded, old, true, "session from a file without deviceId")
	sessions, _ := reloaded.ListSessions()
	if len(sessions) != 1 || sessions[0].IsSystem {
		t.Errorf("unexpected sessions %+v", sessions)
	}
}
