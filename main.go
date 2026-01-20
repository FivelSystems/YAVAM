package main

import (
	"embed"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"
	"yavam/pkg/manager"
	"yavam/pkg/services/config"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func setupLogging() (*os.File, error) {
	configDir, _ := os.UserConfigDir()
	logPath := filepath.Join(configDir, "YAVAM", "application.log")
	os.MkdirAll(filepath.Dir(logPath), 0755)

	fmt.Printf("[DEBUG] Attempting to create log file at: %s\n", logPath)
	os.WriteFile("debug_startup.txt", []byte(fmt.Sprintf("Attempting to create log at: %s\n", logPath)), 0644)

	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Printf("[ERROR] Failed to create log file: %v\n", err)
		return nil, err
	}

	// Redirect standard log
	log.SetOutput(f)

	// Write header
	log.Printf("=== YAVAM Session Started: %s ===\n", time.Now().Format(time.RFC3339))
	return f, nil
}

func main() {
	f, _ := setupLogging()
	if f != nil {
		defer f.Close()
	}

	// User Config Dir
	configDir, _ := os.UserConfigDir()

	// Custom Flag Parsing for Restart Logic
	// We parse manually to avoid affecting any Wails internal flags
	shouldWipe := false
	for _, arg := range os.Args {
		if arg == "--yavam-wait-for-exit" {
			log.Println("Wait flag detected. Sleeping 2s...")
			time.Sleep(2 * time.Second)
		}
		if arg == "--factory-reset" {
			shouldWipe = true
		}
	}

	if shouldWipe {
		log.Println("Performing Factory Reset...")
		dataPath := filepath.Join(configDir, "YAVAM")
		log.Printf("Target Data Path: %s\n", dataPath)

		// Retry Loop
		var err error
		for i := 0; i < 10; i++ { // Increased to 10 attempts (10 seconds max)
			log.Printf("Attempt %d/10 to wipe data...\n", i+1)
			err = os.RemoveAll(dataPath)
			if err == nil {
				log.Println("Success: Data path wiped.")
				break
			}
			log.Printf("Error wiping data: %v. Retrying in 1s...\n", err)
			time.Sleep(1 * time.Second)
		}

		if err != nil {
			log.Printf("CRITICAL: Failed to wipe data after retries: %v\n", err)
		}

		// Also ensure logs dir is gone if we split it
		os.RemoveAll(filepath.Join(configDir, "YAVAM_Logs"))
		log.Println("Factory Reset Logic Complete.")
	}
	dataPath := filepath.Join(configDir, "YAVAM")
	os.MkdirAll(dataPath, 0755)
	cfgService, err := config.NewFileConfigService(dataPath)
	if err != nil {
		// Log error but proceed with defaults?
		log.Println("Warning: Failed to load config:", err.Error())
	}

	// Create manager with dependencies
	// Services are initialized in NewManager if nil
	mgr := manager.NewManager(nil, nil, cfgService)

	// Create an instance of the app structure
	app := NewApp(assets, mgr)

	// Create application with options
	err = wails.Run(&options.App{
		Title:     "YAVAM",
		Width:     1024,
		Height:    768,
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		OnBeforeClose:    app.onBeforeClose,
		Bind: []interface{}{
			app,
		},
		// Removed Custom Windows Webview Options (Using Default)
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: false,
		},
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId:               "a4b2c8d1-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
			OnSecondInstanceLaunch: app.onSecondInstanceLaunch,
		},
	})

	if err != nil {
		log.Println("Error:", err.Error())
	}
}
