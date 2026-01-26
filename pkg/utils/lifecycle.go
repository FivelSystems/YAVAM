package utils

import (
	"log"
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
		log.Println("[Restart] Detected .old executable. Switching to new binary...")
		originalExe := strings.TrimSuffix(executable, ".old")
		if _, err := os.Stat(originalExe); err == nil {
			executable = originalExe
		} else {
			log.Printf("[Restart] Warning: Could not find new binary at %s, sticking with %s\n", originalExe, executable)
		}
	}

	// Launch new instance
	// We do NOT use HideWindow here, as verified by recent fixes.
	log.Printf("[Restart] Spawning new process: %s\n", executable)

	var cmd *exec.Cmd

	if runtime.GOOS == "windows" {
		// Use standard exec.Command with SysProcAttr for detachment
		cmd = exec.Command(executable, append([]string{"--yavam-wait-for-exit"}, extraArgs...)...)
		cmd.SysProcAttr = &syscall.SysProcAttr{
			// CREATE_NEW_PROCESS_GROUP = 0x00000200
			// This allows the new process to survive the parent's death
			CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP,
		}
	} else {
		// Linux/Mac standard execution
		cmd = exec.Command(executable)
		cmd.Args = append(cmd.Args, "--yavam-wait-for-exit")
		cmd.Args = append(cmd.Args, extraArgs...)
	}

	// IMPORTANT: Do not pipe std streams, as closure by parent can kill child
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil

	if err := cmd.Start(); err != nil {
		log.Printf("[Restart] Failed to start process: %v\n", err)
		return err
	}
	log.Printf("[Restart] Process started successfully (PID: %d)\n", cmd.Process.Pid)

	// Detach process (Go specific release of handle)
	if cmd.Process != nil {
		cmd.Process.Release()
	}

	// Schedule exit
	if exitFunc != nil {
		go func() {
			log.Println("[Restart] Exiting current process in 500ms...")
			time.Sleep(500 * time.Millisecond) // Grace period for UI cleanup
			exitFunc()
		}()
	} else {
		// Fallback if no specific exit func provided (e.g. CLI tools)
		go func() {
			log.Println("[Restart] Exiting current process (fallback) in 500ms...")
			time.Sleep(500 * time.Millisecond)
			os.Exit(0)
		}()
	}

	return nil
}
