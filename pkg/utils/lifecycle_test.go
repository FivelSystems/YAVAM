package utils

import (
	"os"
	"testing"
	"time"
)

// TestRestartApplication_ProcessLaunch validates that the restart logic attempts to start a process.
func TestRestartApplication_ProcessLaunch(t *testing.T) {
	if os.Getenv("GO_TEST_RESTART_PROCESS") == "1" {
		// We are the spawned process.
		return
	}

	// We verify that passing a mock exit function works and it gets called.
	calledExit := false
	mockExit := func() {
		calledExit = true
	}

	err := RestartApplication(mockExit)
	if err != nil {
		t.Fatalf("RestartApplication returned error: %v", err)
	}

	// Wait for the goroutine to fire
	time.Sleep(1 * time.Second)

	if !calledExit {
		t.Error("Exit function was not called")
	}
}

func TestRestartApplication_CalledExit(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping slow test in short mode")
	}

	exitCalled := make(chan bool)
	mockExit := func() {
		exitCalled <- true
	}

	err := RestartApplication(mockExit)
	if err != nil {
		t.Fatalf("Failed to restart: %v", err)
	}

	select {
	case <-exitCalled:
		// Success
	case <-time.After(2 * time.Second):
		t.Fatal("Exit function was not called within timeout")
	}
}
