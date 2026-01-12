package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"varmanager/pkg/manager"
	"varmanager/pkg/models"
	"varmanager/pkg/updater"

	"varmanager/pkg/server"

	_ "embed"

	stdruntime "runtime"

	"github.com/energye/systray"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed build/windows/icon.ico
var iconData []byte

//go:embed wails.json
var wailsConfig []byte

// App struct
type App struct {
	ctx             context.Context
	manager         *manager.Manager
	server          *server.Server
	minimizeOnClose bool
	assets          fs.FS
	isQuitting      bool
	trayRunning     bool

	// Scan Cancellation
	scanMu     sync.Mutex
	scanCancel context.CancelFunc
	scanWg     sync.WaitGroup
}

// NewApp creates a new App application struct
func NewApp(assets fs.FS, m *manager.Manager) *App {
	if m == nil {
		m = manager.NewManager(nil, nil, nil)
	}
	return &App{
		manager: m,
		assets:  assets,
	}
}

func (a *App) GetLibraryCounts(libraries []string) map[string]int {
	return a.manager.GetLibraryCounts(libraries)
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	updater.CleanupOld()

	// Sub into frontend/dist
	subAssets, err := fs.Sub(a.assets, "frontend/dist")
	if err != nil {
		// Fallback or panic? In dev mode this might fail if using real fs?
		// Actually Wails passes `embed.FS` in main.go
		// If it fails, maybe we just pass raw assets?
		subAssets = a.assets
	}

	a.server = server.NewServer(ctx, a.manager, subAssets, a.GetAppVersion(), func() {
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
	return a.manager.CopyPackagesToLibrary(filePaths, destLibPath, overwrite, func(current, total int, filename string, status string) {
		runtime.EventsEmit(a.ctx, "install-progress", map[string]interface{}{
			"current":  current,
			"total":    total,
			"filename": filename,
			"status":   status,
		})
	})
}

// CheckCollisions checks if files already exist in the destination library without copying
func (a *App) CheckCollisions(filePaths []string, destLibPath string) ([]string, error) {
	return a.manager.CheckCollisions(filePaths, destLibPath)
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

// GetAppVersion returns the current application version
func (a *App) GetAppVersion() string {
	var cfg struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}
	if err := json.Unmarshal(wailsConfig, &cfg); err != nil {
		return "Error"
	}
	return cfg.Info.ProductVersion
}

func (a *App) GetDiskSpace(path string) (manager.DiskSpaceInfo, error) {
	return a.manager.GetDiskSpace(path)
}

// CancelScan signals the running scan to stop
// and waits for it to finish
func (a *App) CancelScan() {
	a.scanMu.Lock()
	if a.scanCancel != nil {
		a.scanCancel()
	}
	a.scanMu.Unlock()
	a.scanWg.Wait()
}

// ScanPackages triggers the scan process
func (a *App) ScanPackages(vamPath string) error {
	if vamPath == "" || vamPath == "." {
		// Nothing to scan
		return nil
	}

	// Cancel previous scan and wait
	a.CancelScan()

	a.scanMu.Lock()
	// Create new context wrapped around app context
	ctx, cancel := context.WithCancel(a.ctx)
	a.scanCancel = cancel
	a.scanMu.Unlock()

	a.scanWg.Add(1)
	go func() {
		defer a.scanWg.Done()
		defer cancel()

		err := a.manager.ScanAndAnalyze(ctx, vamPath, func(pkg models.VarPackage) {
			runtime.EventsEmit(a.ctx, "package:scanned", pkg)
		}, func(current, total int) {
			runtime.EventsEmit(a.ctx, "scan:progress", map[string]int{"current": current, "total": total})
		})

		if err != nil {
			if err != context.Canceled {
				runtime.EventsEmit(a.ctx, "scan:error", err.Error())
			}
		} else {
			runtime.EventsEmit(a.ctx, "scan:complete", true)
		}
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
	return a.manager.InstallPackage(files, vamPath, func(current, total int) {
		runtime.EventsEmit(a.ctx, "scan:progress", map[string]int{"current": current, "total": total})
	})
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

// Library Management
func (a *App) GetConfiguredLibraries() []string {
	return a.manager.GetLibraries()
}

func (a *App) AddConfiguredLibrary(path string) error {
	return a.manager.AddLibrary(path)
}

func (a *App) RemoveConfiguredLibrary(path string) error {
	return a.manager.RemoveLibrary(path)
}

func (a *App) ReorderConfiguredLibraries(paths []string) error {
	return a.manager.SetLibraries(paths)
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
}

func (a *App) onBeforeClose(ctx context.Context) (prevent bool) {
	// Minimize to tray if option enabled
	if a.minimizeOnClose && !a.isQuitting {
		runtime.WindowHide(ctx)
		if !a.trayRunning {
			a.trayRunning = true
			// Start systray loop in a goroutine with thread lock
			go func() {
				stdruntime.LockOSThread()
				systray.Run(a.onTrayReady, a.onTrayExit)
			}()
		}
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
	systray.SetIcon(iconData)
	systray.SetTitle("YAVAM")
	systray.SetTooltip("YAVAM")

	// Handle Left Click on Icon to Restore
	systray.SetOnClick(func(menu systray.IMenu) {
		runtime.WindowShow(a.ctx)
		if runtime.WindowIsMinimised(a.ctx) {
			runtime.WindowUnminimise(a.ctx)
		}
		systray.Quit()
	})

	mShow := systray.AddMenuItem("Show Window", "Restore the window")
	mShow.Click(func() {
		runtime.WindowShow(a.ctx)
		if runtime.WindowIsMinimised(a.ctx) {
			runtime.WindowUnminimise(a.ctx)
		}
		systray.Quit() // Stop the tray loop and remove icon
	})

	mQuit := systray.AddMenuItem("Quit", "Quit the application")
	mQuit.Click(func() {
		// Check if server is running
		if a.server != nil && a.server.IsRunning() {
			res, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
				Type:          runtime.QuestionDialog,
				Title:         "Server Running",
				Message:       "The web server is currently running. Do you want to stop the server and quit?",
				Buttons:       []string{"Yes", "No"},
				DefaultButton: "No",
				CancelButton:  "No",
			})
			if err != nil || res == "No" {
				return
			}
			a.server.Stop()
		}

		a.isQuitting = true
		systray.Quit()
		runtime.Quit(a.ctx)
	})
}

// ResolveConflicts handles deduplication and cleanup of conflicting packages
func (a *App) ResolveConflicts(keepPath string, others []string, libraryPath string) (*models.ResolveConflictResult, error) {
	return a.manager.ResolveConflicts(keepPath, others, libraryPath)
}

func (a *App) onTrayExit() {
	a.trayRunning = false
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

// CheckForUpdates checks if a new version is available
func (a *App) CheckForUpdates() (*updater.UpdateInfo, error) {
	return updater.GetLatestVersion(a.GetAppVersion())
}

// ApplyUpdate performs the update process
func (a *App) ApplyUpdate(url string) error {
	return updater.ApplyUpdate(url)
}

// RestartApp restarts the application
func (a *App) RestartApp() {
	executable, err := os.Executable()
	if err != nil {
		return
	}
	// Use direct process creation without shell wrapper
	// This prevents command injection vulnerabilities
	cmd := exec.Command(executable)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmd.Start()

	// Quit current
	runtime.Quit(a.ctx)
}
