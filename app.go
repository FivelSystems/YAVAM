package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"varmanager/pkg/manager"
	"varmanager/pkg/models"

	"varmanager/pkg/server"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx     context.Context
	manager *manager.Manager
	server  *server.Server
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
	a.server = server.NewServer(ctx, a.manager)
}

// GetPackageContents wrapper
func (a *App) GetPackageContents(pkgPath string) ([]models.PackageContent, error) {
	return a.manager.GetPackageContents(pkgPath)
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
func (a *App) ScanPackages(vamPath string) (models.ScanResult, error) {
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

// SetAlwaysOnTop toggles the window pinned state
func (a *App) SetAlwaysOnTop(onTop bool) {
	runtime.WindowSetAlwaysOnTop(a.ctx, onTop)
}

// Server Methods

func (a *App) StartServer(port string, path string) error {
	if a.server == nil {
		return fmt.Errorf("server not initialized")
	}
	return a.server.Start(port, path)
}

func (a *App) StopServer() error {
	if a.server == nil {
		return nil
	}
	return a.server.Stop()
}

func (a *App) GetLocalIP() string {
	if a.server == nil {
		return ""
	}
	return a.server.GetOutboundIP()
}
