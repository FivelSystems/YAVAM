package main

import (
	"context"
	"fmt"
	"path/filepath"
	"varmanager/pkg/manager"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx     context.Context
	manager *manager.Manager
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		manager: manager.NewManager(),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// ScanPackages triggers the scan process
func (a *App) ScanPackages(vamPath string) (manager.ScanResult, error) {
	// Robustness: If user selected "AddonPackages" directly, move up to root
	if filepath.Base(vamPath) == "AddonPackages" {
		vamPath = filepath.Dir(vamPath)
	}
	return a.manager.ScanAndAnalyze(vamPath)
}

// GetFilters returns the list of unique tags/creators found
func (a *App) GetFilters(vamPath string) ([]string, error) {
	res, err := a.manager.ScanAndAnalyze(vamPath)
	return res.Tags, err
}

// TogglePackage enables or disables a package
func (a *App) TogglePackage(pkgPath string, enable bool, vamPath string) (string, error) {
	// For this call we don't strictly need the full list if we trust the path,
	// passing nil for list for now as implementation above didn't use it except to search validation which we removed.
	return a.manager.TogglePackage(nil, pkgPath, enable, vamPath)
}

// DisableOldVersions removes older versions of a package
func (a *App) DisableOldVersions(creator string, pkgName string, vamPath string) error {
	// We need the latest state, so we scan first? Or trust frontend?
	// The manager method implementation needs the package list.
	// For efficiency, let's scan internally.
	res, err := a.manager.ScanAndAnalyze(vamPath)
	if err != nil {
		return err
	}
	return a.manager.DisableOldVersions(res.Packages, creator, pkgName, vamPath)
}

// InstallFiles handles dropped files
func (a *App) InstallFiles(files []string, vamPath string) ([]string, error) {
	fmt.Printf("Backend received files to install: %v\n", files)
	return a.manager.InstallPackage(files, vamPath)
}

// SelectDirectory opens a native dialog to select a folder
func (a *App) SelectDirectory() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Library Folder",
	})
}

func (a *App) ToggleFavorite(pkgName string) {
	err := a.manager.ToggleFavorite(pkgName)
	if err != nil {
		fmt.Println("Error toggling favorite:", err)
	}
}

func (a *App) ToggleHidden(pkgName string) {
	err := a.manager.ToggleHidden(pkgName)
	if err != nil {
		fmt.Println("Error toggling hidden:", err)
	}
}
