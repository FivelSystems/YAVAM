package logger

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

var (
	logFile *os.File
	mu      sync.Mutex
)

// Init initializes the file logger
func Init(appDataPath string) error {
	mu.Lock()
	defer mu.Unlock()

	if logFile != nil {
		logFile.Close()
	}

	logPath := filepath.Join(appDataPath, "application.log")

	// Open in Append mode, Create if not exists
	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	logFile = f

	// Write session start separator
	Write("INFO", "==========================================")
	Write("INFO", fmt.Sprintf("Session Started: %s", time.Now().Format(time.RFC3339)))
	Write("INFO", "==========================================")
	return nil
}

// Write writes a log entry to file and stdout
func Write(level string, message string) {
	mu.Lock()
	defer mu.Unlock()

	timestamp := time.Now().Format("2006-01-02 15:04:05")
	line := fmt.Sprintf("[%s] [%s] %s\n", timestamp, level, message)

	// Always print to console for dev
	fmt.Print(line)

	if logFile != nil {
		if _, err := logFile.WriteString(line); err != nil {
			fmt.Printf("Failed to write to log file: %v\n", err)
		}
	}
}

func Close() {
	mu.Lock()
	defer mu.Unlock()
	if logFile != nil {
		logFile.Close()
		logFile = nil
	}
}

// Helpers
func Info(format string, args ...interface{}) {
	Write("INFO", fmt.Sprintf(format, args...))
}

func Warn(format string, args ...interface{}) {
	Write("WARN", fmt.Sprintf(format, args...))
}

func Error(format string, args ...interface{}) {
	Write("ERROR", fmt.Sprintf(format, args...))
}
