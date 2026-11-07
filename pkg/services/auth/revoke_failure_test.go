package auth

import "testing"

func TestRevokeSessionRestoresSessionWhenPersistFails(t *testing.T) {
	store := newStoreWithAdmin(t)
	svc, _ := newServiceOnStore(t, store)
	token, err := svc.Login("admin", failureTestPassword, "phone", "")
	if err != nil {
		t.Fatal(err)
	}
	sessions, _ := svc.ListSessions()
	store.failSaves = true

	if err := svc.RevokeSession(sessions[0].ID); err == nil {
		t.Fatal("expected the persist error to be returned")
	}

	assertSessionValidity(t, svc, token, true, "session after a failed revoke")
	if listed, _ := svc.ListSessions(); len(listed) != 1 {
		t.Errorf("sessions = %d, want 1", len(listed))
	}

	store.failSaves = false
	if err := svc.RevokeSession(sessions[0].ID); err != nil {
		t.Fatalf("retry should succeed: %v", err)
	}
	assertSessionValidity(t, svc, token, false, "session after a successful revoke")
}

func TestRevokeUnknownSessionReportsNotFound(t *testing.T) {
	svc, _ := newServiceOnStore(t, newStoreWithAdmin(t))
	if err := svc.RevokeSession("missing"); err == nil {
		t.Fatal("expected an error")
	}
}
