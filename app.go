package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"varmanager/pkg/manager"
	"varmanager/pkg/models"

	"varmanager/pkg/server"

	_ "embed"

	"github.com/energye/systray"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed build/windows/icon.ico
var iconData []byte

// App struct
type App struct {
	ctx             context.Context
	manager         *manager.Manager
	server          *server.Server
	minimizeOnClose bool
	assets          fs.FS
	isQuitting      bool
}

// NewApp creates a new App application struct
func NewApp(assets fs.FS, m *manager.Manager) *App {
	return &App{
		manager: m,
		assets:  assets,
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Sub into frontend/dist
	subAssets, err := fs.Sub(a.assets, "frontend/dist")
	if err != nil {
		// Fallback or panic? In dev mode this might fail if using real fs?
		// Actually Wails passes `embed.FS` in main.go
		// If it fails, maybe we just pass raw assets?
		subAssets = a.assets
	}

	a.server = server.NewServer(ctx, a.manager, subAssets, func() {
		runtime.WindowShow(ctx)
	})
}

func (a *App) GetPackageContents(pkgPath string) ([]models.PackageContent, error) {
	return a.manager.GetPackageContents(pkgPath)
}

// GetPackageThumbnail returns the Base64 encoded thumbnail for a package
func (a *App) GetPackageThumbnail(pkgPath string) (string, error) {
	bytes, err := a.manager.GetThumbnail(pkgPath)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(bytes), nil
}

func (a *App) OpenFolderInExplorer(path string) {
	err := a.manager.OpenFolder(path)
	if err != nil {
		fmt.Println("Error opening folder:", err)
	}
}

func (a *App) DeleteFileToRecycleBin(path string) error {
	return a.manager.DeleteToTrash(path)
}

// CopyPackagesToLibrary copies a list of package files to a destination library
// Returns list of collided filenames (if overwrite=false) or error
func (a *App) CopyPackagesToLibrary(filePaths []string, destLibPath string, overwrite bool) ([]string, error) {
	return a.manager.CopyPackagesToLibrary(filePaths, destLibPath, overwrite)
}

func (a *App) CopyFileToClipboard(path string) {
	err := a.manager.CopyFileToClipboard(path)
	if err != nil {
		fmt.Println("Error copying file to clipboard:", err)
	}
}

func (a *App) CutFileToClipboard(path string) {
	err := a.manager.CutFileToClipboard(path)
	if err != nil {
		fmt.Println("Error cutting file to clipboard:", err)
	}
}

// DownloadPackage copies a file to the target directory (or default Downloads)
func (a *App) DownloadPackage(pkgPath string, customPath string) error {
	targetDir := customPath
	if targetDir == "" {
		home, _ := os.UserHomeDir()
		targetDir = filepath.Join(home, "Downloads")
	}
	return a.manager.DownloadPackage(pkgPath, targetDir)
}

// GetUserDownloadsDir returns the default user downloads directory
func (a *App) GetUserDownloadsDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Downloads")
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// ScanPackages triggers the scan process
func (a *App) ScanPackages(vamPath string) error {
	// Robustness: If user selected "AddonPackages" directly, move up to root
	if filepath.Base(vamPath) == "AddonPackages" {
		vamPath = filepath.Dir(vamPath)
	}

	go func() {
		err := a.manager.ScanAndAnalyze(a.ctx, vamPath, func(pkg models.VarPackage) {
			runtime.EventsEmit(a.ctx, "package:scanned", pkg)
		}, func(current, total int) {
			runtime.EventsEmit(a.ctx, "scan:progress", map[string]int{"current": current, "total": total})
		})
		if err != nil {
			runtime.EventsEmit(a.ctx, "scan:error", err.Error())
		}
		runtime.EventsEmit(a.ctx, "scan:complete", true)
	}()

	return nil
}

// GetFilters returns the list of unique tags/creators found
func (a *App) GetFilters(vamPath string) ([]string, error) {
	var pkgs []models.VarPackage
	err := a.manager.ScanAndAnalyze(a.ctx, vamPath, func(p models.VarPackage) {
		pkgs = append(pkgs, p)
	}, nil)
	if err != nil {
		return nil, err
	}

	// Extract tags
	tagSet := make(map[string]bool)
	for _, p := range pkgs {
		for _, t := range p.Tags {
			tagSet[t] = true
		}
	}
	var tags []string
	for t := range tagSet {
		tags = append(tags, t)
	}
	return tags, nil
}

// TogglePackage enables or disables a package
func (a *App) TogglePackage(pkgPath string, enable bool, vamPath string, merge bool) (string, error) {
	// For this call we don't strictly need the full list if we trust the path,
	// passing nil for list for now as implementation above didn't use it except to search validation which we removed.
	return a.manager.TogglePackage(nil, pkgPath, enable, vamPath, merge)
}

// DisableOldVersions removes older versions of a package
func (a *App) DisableOldVersions(creator string, pkgName string, vamPath string) error {
	// We need the latest state, so we scan first? Or trust frontend?
	// The manager method implementation needs the package list.
	// For efficiency, let's scan internally.
	var pkgs []models.VarPackage
	err := a.manager.ScanAndAnalyze(a.ctx, vamPath, func(p models.VarPackage) {
		pkgs = append(pkgs, p)
	}, nil)
	if err != nil {
		return err
	}
	return a.manager.DisableOldVersions(pkgs, creator, pkgName, vamPath)
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

// SetAlwaysOnTop toggles the window pinned state
func (a *App) SetAlwaysOnTop(onTop bool) {
	runtime.WindowSetAlwaysOnTop(a.ctx, onTop)
}

// Server Methods

func (a *App) StartServer(port string, path string, libraries []string) error {
	if a.server == nil {
		return fmt.Errorf("server not initialized")
	}
	return a.server.Start(port, path, libraries)
}

func (a *App) StopServer() error {
	if a.server == nil {
		return nil
	}
	return a.server.Stop()
}

func (a *App) UpdateServerLibraries(libraries []string) {
	if a.server != nil {
		a.server.UpdateLibraries(libraries)
	}
}

func (a *App) GetLocalIP() string {
	if a.server == nil {
		return ""
	}
	return a.server.GetOutboundIP()
}

func (a *App) SetMinimizeOnClose(val bool) {
	a.minimizeOnClose = val
	if val {
		systray.SetIcon(iconData)
		systray.SetTitle("YAVAM")
		systray.SetTooltip("YAVAM")
	} else {
		// Attempts to hide the tray icon by setting an empty icon or stopping it?
		// Hiding is platform specific and tricky.
		// For now, we only ensure it APPEARS when enabled.
		// If disabled, we might leave it or try to hide it if possible.
		// Assuming user just wants it off by default.
	}
}

func (a *App) onBeforeClose(ctx context.Context) (prevent bool) {
	// Only minimize to tray if Server is Running AND user enabled the option
	if a.minimizeOnClose && a.server != nil && a.server.IsRunning() && !a.isQuitting {
		runtime.WindowHide(ctx)
		return true
	}

	// Normal Close or Quit
	if a.server != nil && a.server.IsRunning() {
		res, err := runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
			Type:          runtime.QuestionDialog,
			Title:         "Server Running",
			Message:       "The web server is currently running. Do you want to stop the server and quit?",
			Buttons:       []string{"Yes", "No"},
			DefaultButton: "No",
			CancelButton:  "No",
		})
		if err != nil {
			return false // On error, just close?
		}
		if res == "No" {
			a.isQuitting = false
			return true // Prevent close
		}
		// User confirmed
		a.server.Stop()
	}

	return false
}

func (a *App) onSecondInstanceLaunch(secondInstanceData options.SecondInstanceData) {
	runtime.WindowShow(a.ctx)
	if runtime.WindowIsMinimised(a.ctx) {
		runtime.WindowUnminimise(a.ctx)
	}
	runtime.WindowSetAlwaysOnTop(a.ctx, true)
	runtime.WindowSetAlwaysOnTop(a.ctx, false)
}

func (a *App) onTrayReady() {
	// We do NOT set the icon here to keep it hidden by default.
	// It will be set when SetMinimizeOnClose(true) is called.

	mShow := systray.AddMenuItem("Show Window", "Restore the window")
	mShow.Click(func() {
		runtime.WindowShow(a.ctx)
		if runtime.WindowIsMinimised(a.ctx) {
			runtime.WindowUnminimise(a.ctx)
		}
	})

	mQuit := systray.AddMenuItem("Quit", "Quit the application")
	mQuit.Click(func() {
		a.isQuitting = true
		systray.Quit()
		runtime.Quit(a.ctx)
	})
}

// ResolveConflicts handles deduplication and cleanup of conflicting packages
func (a *App) ResolveConflicts(keepPath string, others []string, libraryPath string) (*manager.ResolveConflictResult, error) {
	return a.manager.ResolveConflicts(keepPath, others, libraryPath)
}

func (a *App) onTrayExit() {
	// Cleanup
}

// OpenAppDataFolder opens the application data directory
func (a *App) OpenAppDataFolder() {
	a.manager.OpenFolder(a.manager.DataPath)
}

// ClearAppData deletes the application data directory and resets configuration
func (a *App) ClearAppData() error {
	// 1. Delete the active data path
	if err := os.RemoveAll(a.manager.DataPath); err != nil {
		return err
	}

	// 2. Delete the pointer file (reset configuration)
	configDir, _ := os.UserConfigDir()
	pointerFile := filepath.Join(configDir, "YAVAM", "root.json")
	os.Remove(pointerFile) // Ignore error if file doesn't exist

	return nil
}

// IsConfigured returns true if the app has been set up
func (a *App) IsConfigured() bool {
	return a.manager.IsConfigured()
}

// FinishSetup completes the setup wizard
func (a *App) FinishSetup() error {
	return a.manager.FinishSetup()
}
