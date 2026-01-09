package main

import (
	"embed"
	"varmanager/pkg/manager"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create manager
	mgr := manager.NewManager()

	// Create an instance of the app structure
	app := NewApp(assets, mgr)

	// Create application with options
	err := wails.Run(&options.App{
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
