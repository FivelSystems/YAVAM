package auth

import (
	"sync"
	"testing"
)

func TestHasCustomPasswordIsServedFromCache(t *testing.T) {
	svc, _, _ := newFreshService(t)
	if err := svc.SetPassword(testPassword); err != nil {
		t.Fatalf("SetPassword: %v", err)
	}

	svc.mu.Lock()
	svc.adminHash = "not-a-bcrypt-hash"
	svc.mu.Unlock()

	if !svc.HasCustomPassword() {
		t.Fatal("HasCustomPassword must answer from the cached value, not recompute the hash")
	}
}

func TestHasCustomPasswordCacheFollowsLoadAndSetPassword(t *testing.T) {
	svc, clock, path := newFreshService(t)
	if svc.HasCustomPassword() {
		t.Fatal("fresh install must report the default password")
	}

	if err := svc.SetPassword(testPassword); err != nil {
		t.Fatalf("SetPassword: %v", err)
	}
	if !svc.HasCustomPassword() {
		t.Fatal("cache must flip after SetPassword")
	}

	reloaded, err := NewSimpleAuthServiceWithClock(path, clock.Now)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	if !reloaded.HasCustomPassword() {
		t.Fatal("cache must be primed from the persisted hash on load")
	}
}

func TestHasCustomPasswordIsSafeUnderConcurrency(t *testing.T) {
	svc, _, _ := newFreshService(t)

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			svc.HasCustomPassword()
		}()
	}
	if err := svc.SetPassword(testPassword); err != nil {
		t.Fatalf("SetPassword: %v", err)
	}
	wg.Wait()
}
