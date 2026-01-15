package utils

import (
	"os"
	"os/exec"
	"time"
)

// RestartApplication restarts the current application process.
// It launches a new instance of the current executable and then terminates the current one.
// exitFunc is an optional callback to trigger the application exit (e.g. runtime.Quit).
func RestartApplication(exitFunc func()) error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}

	// Launch new instance
	// We do NOT use HideWindow here, as verified by recent fixes.
	cmd := exec.Command(executable)
	if err := cmd.Start(); err != nil {
		return err
	}

	// Detach process to ensure it survives parent death
	if cmd.Process != nil {
		cmd.Process.Release()
	}

	// Schedule exit
	if exitFunc != nil {
		go func() {
			time.Sleep(500 * time.Millisecond) // Grace period for UI cleanup
			exitFunc()
		}()
	} else {
		// Fallback if no specific exit func provided (e.g. CLI tools)
		go func() {
			time.Sleep(500 * time.Millisecond)
			os.Exit(0)
		}()
	}

	return nil
}
