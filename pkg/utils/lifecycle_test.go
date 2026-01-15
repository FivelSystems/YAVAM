package utils

import (
	"os"
	"testing"
	"time"
)

// TestRestartApplication_ProcessLaunch validates that the restart logic attempts to start a process.
func TestRestartApplication_ProcessLaunch(t *testing.T) {
	markerFile := "restart_marker.tmp"

	if os.Getenv("YAVAM_TEST_RESTART") == "1" {
		// We are the spawned process.
		// Write marker and exit
		os.WriteFile(markerFile, []byte("child ran"), 0644)
		return
	}
	defer os.Remove(markerFile) // Cleanup

	// Set env for child
	os.Setenv("YAVAM_TEST_RESTART", "1")
	defer os.Unsetenv("YAVAM_TEST_RESTART")

	// We verify that passing a mock exit function works and it gets called.
	calledExit := false
	mockExit := func() {
		calledExit = true
	}

	err := RestartApplication(mockExit)
	if err != nil {
		t.Fatalf("RestartApplication returned error: %v", err)
	}

	// Wait for the exit callback (Parent logic)
	time.Sleep(500 * time.Millisecond)
	if !calledExit {
		t.Error("Exit function was not called")
	}

	// Verify IsChildRan
	// The child process runs TestRestartApplication_ProcessLaunch again.
	// Which hits `if os.Getenv...` and writes the file.

	// We need to wait for the child to write
	// Give it a few seconds (process startup on Windows is slow)
	startWait := time.Now()
	for {
		if _, err := os.Stat(markerFile); err == nil {
			// Success!
			return
		}
		if time.Since(startWait) > 5*time.Second {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	t.Error("Restarted process did not write marker file (did it fail to launch?)")
}

func TestRestartApplication_CalledExit(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping slow test in short mode")
	}

	// Skip if we are the child to avoid double noise
	if os.Getenv("YAVAM_TEST_RESTART") == "1" {
		return
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
