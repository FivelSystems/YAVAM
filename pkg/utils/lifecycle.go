package utils

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

// RestartApplication restarts the current application process.
// It launches a new instance of the current executable and then terminates the current one.
// exitFunc is an optional callback to trigger the application exit (e.g. runtime.Quit).
// extraArgs are optional CLI arguments to pass to the new instance.
func RestartApplication(exitFunc func(), extraArgs ...string) error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}

	// Hotfix: Handle Updater Rename Scenario
	// If we are running as ".old", it means we were just updated.
	// os.Executable() might return the ".old" path on Windows.
	// We MUST switch to the original ".exe" (the new version).
	if filepath.Ext(executable) == ".old" {
		fmt.Println("[Restart] Detected .old executable. Switching to new binary...")
		originalExe := strings.TrimSuffix(executable, ".old")
		if _, err := os.Stat(originalExe); err == nil {
			executable = originalExe
		} else {
			fmt.Printf("[Restart] Warning: Could not find new binary at %s, sticking with %s\n", originalExe, executable)
		}
	}

	// Launch new instance
	// We do NOT use HideWindow here, as verified by recent fixes.
	fmt.Printf("[Restart] Spawning new process: %s\n", executable)

	cmd := exec.Command(executable)

	// Windows-specific detachment
	if runtime.GOOS == "windows" {
		// CREATE_NEW_PROCESS_GROUP (0x200) + CREATE_BREAKAWAY_FROM_JOB (0x1000000)
		cmd.SysProcAttr = &syscall.SysProcAttr{
			CreationFlags: 0x00000200 | 0x01000000,
		}
	}

	// Pass the wait flag
	cmd.Args = append(cmd.Args, "--yavam-wait-for-exit")
	// Append extra args
	cmd.Args = append(cmd.Args, extraArgs...)

	// IMPORTANT: Do not pipe std streams, as closure by parent can kill child
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil

	if err := cmd.Start(); err != nil {
		fmt.Printf("[Restart] Failed to start process: %v\n", err)
		return err
	}
	fmt.Printf("[Restart] Process started successfully (PID: %d)\n", cmd.Process.Pid)

	// Detach process (Go specific release of handle)
	if cmd.Process != nil {
		cmd.Process.Release()
	}

	// Schedule exit
	if exitFunc != nil {
		go func() {
			fmt.Println("[Restart] Exiting current process in 500ms...")
			time.Sleep(500 * time.Millisecond) // Grace period for UI cleanup
			exitFunc()
		}()
	} else {
		// Fallback if no specific exit func provided (e.g. CLI tools)
		go func() {
			fmt.Println("[Restart] Exiting current process (fallback) in 500ms...")
			time.Sleep(500 * time.Millisecond)
			os.Exit(0)
		}()
	}

	return nil
}
