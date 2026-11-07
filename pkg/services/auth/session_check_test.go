package auth

import (
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const slowHashCost = 13

func lastUsedAt(svc *SimpleTokenAuthService, token string) time.Time {
	svc.mu.RLock()
	defer svc.mu.RUnlock()
	return svc.sessions[hashToken(token)].LastUsedAt
}

func TestCheckTokenDoesNotExtendSession(t *testing.T) {
	svc, clock, _ := newClockedService(t)
	token := loginToken(t, svc, "dev")
	loggedInAt := lastUsedAt(svc, token)

	clock.Advance(time.Hour)
	user, err := svc.CheckToken(token)
	if err != nil {
		t.Fatalf("CheckToken: %v", err)
	}
	if user.Token != token {
		t.Errorf("CheckToken should return the presented token")
	}
	if got := lastUsedAt(svc, token); !got.Equal(loggedInAt) {
		t.Errorf("CheckToken moved LastUsedAt from %v to %v", loggedInAt, got)
	}

	if _, err := svc.ValidateToken(token); err != nil {
		t.Fatalf("ValidateToken: %v", err)
	}
	if got := lastUsedAt(svc, token); !got.Equal(clock.Now()) {
		t.Errorf("ValidateToken should slide LastUsedAt, got %v", got)
	}
}

func TestCheckTokenRejectsAndDeletesExpiredSession(t *testing.T) {
	svc, clock, _ := newClockedService(t)
	token := loginToken(t, svc, "dev")

	clock.Advance(SessionIdleTimeout)
	if _, err := svc.CheckToken(token); err != ErrInvalidToken {
		t.Fatalf("expected ErrInvalidToken, got %v", err)
	}
	svc.mu.RLock()
	_, stillStored := svc.sessions[hashToken(token)]
	svc.mu.RUnlock()
	if stillStored {
		t.Error("expired session should be deleted by CheckToken")
	}
}

func TestCheckTokenRejectsRevokedSession(t *testing.T) {
	svc, _, _ := newClockedService(t)
	token := loginToken(t, svc, "dev")
	svc.RevokeToken(token)

	if _, err := svc.CheckToken(token); err != ErrInvalidToken {
		t.Fatalf("expected ErrInvalidToken, got %v", err)
	}
}

func TestValidateTokenNotBlockedByLoginPasswordCheck(t *testing.T) {
	svc, _, _ := newClockedService(t)
	token := loginToken(t, svc, "dev")

	slowHash, err := bcrypt.GenerateFromPassword([]byte("secret"), slowHashCost)
	if err != nil {
		t.Fatal(err)
	}
	svc.mu.Lock()
	svc.adminHash = string(slowHash)
	svc.mu.Unlock()

	loginDone := make(chan struct{})
	go func() {
		defer close(loginDone)
		svc.Login("admin", "secret", "other-device", "")
	}()

	time.Sleep(50 * time.Millisecond)
	validated := make(chan error, 1)
	go func() {
		_, err := svc.ValidateToken(token)
		validated <- err
	}()

	select {
	case err := <-validated:
		if err != nil {
			t.Errorf("ValidateToken: %v", err)
		}
	case <-time.After(150 * time.Millisecond):
		t.Error("ValidateToken blocked while Login was comparing the password")
	}
	<-loginDone
}

func TestLoginRejectedWhenPasswordChangesDuringCheck(t *testing.T) {
	svc, _, _ := newClockedService(t)

	slowHash, err := bcrypt.GenerateFromPassword([]byte("secret"), slowHashCost)
	if err != nil {
		t.Fatal(err)
	}
	svc.mu.Lock()
	svc.adminHash = string(slowHash)
	svc.mu.Unlock()

	result := make(chan error, 1)
	go func() {
		_, err := svc.Login("admin", "secret", "dev", "")
		result <- err
	}()

	time.Sleep(50 * time.Millisecond)
	if err := svc.SetPassword("changed-password"); err != nil {
		t.Fatal(err)
	}

	if err := <-result; err == nil {
		t.Error("login verified against the old password should be rejected")
	}
}
