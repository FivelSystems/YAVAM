package main

import (
	"embed"
	"os"
	"path/filepath"
	"varmanager/pkg/manager"
	"varmanager/pkg/services/config"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Initialize Config Service
	configDir, _ := os.UserConfigDir()
	dataPath := filepath.Join(configDir, "YAVAM")
	os.MkdirAll(dataPath, 0755)

	cfgService, err := config.NewFileConfigService(dataPath)
	if err != nil {
		// Log error but proceed with defaults?
		println("Warning: Failed to load config:", err.Error())
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
		println("Error:", err.Error())
	}
}
