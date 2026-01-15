package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"
	"yavam/pkg/manager"
	"yavam/pkg/models"
	"yavam/pkg/services/auth"
	"yavam/pkg/services/config"
	"yavam/pkg/updater"
	"yavam/pkg/utils"

	"yavam/pkg/server"

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

//go:embed CHANGELOG.md
var changelogData string

// App struct
type App struct {
	ctx             context.Context
	manager         *manager.Manager
	server          *server.Server
	auth            auth.AuthService
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

	// Initialize Auth Service
	// Initialize Auth Service
	configDir, _ := os.UserConfigDir()
	authConfigPath := filepath.Join(configDir, "YAVAM", "auth.json")
	var authErr error
	a.auth, authErr = auth.NewSimpleAuthService(authConfigPath)
	if authErr != nil {
		// Log or Panic? For now, we panic as auth is critical if it fails to init store
		// But in prod we might just log and fallback to memory?
		// Let's print for now
		fmt.Printf("Failed to initialize auth service: %v\n", authErr)
	}

	a.server = server.NewServer(ctx, a.manager, a.auth, subAssets, a.GetAppVersion(), func() {
		runtime.WindowShow(ctx)
	})

	// Check Server Config
	cfg := a.manager.GetConfig()
	if cfg.ServerEnabled {
		go func() {
			// Small delay to ensure UI ready? Or just start.
			// Start on default port 8080 or need config for port?
			// Defaulting to 8080 for now as it's not in config yet.
			// Path defaults to active (Vam) path.
			// Config VamPath might be empty if just setup,
			// but if ServerEnabled is true, VamPath should be set.
			if len(cfg.Libraries) > 0 {
				port := cfg.ServerPort
				if port == "" {
					port = "18888"
				}
				// We need to pass the libraries as well
				if err := a.server.Start(port, cfg.Libraries); err == nil {
					runtime.EventsEmit(a.ctx, "server:status:changed", true)
				}
			}
		}()
	}
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

// Login validates credentials using secure Challenge-Response flow
// This runs LOCALLY inside the Wails app, so it acts as the "Client"
func (a *App) Login(username, password string) (string, error) {
	if a.auth == nil {
		return "", fmt.Errorf("auth service not initialized")
	}

	// 1. Initiate Login (Get Nonce)
	nonce, err := a.auth.InitiateLogin(username)
	if err != nil {
		return "", err
	}

	// 2. Calculate Proof (Verify knowledge of password without sending it)
	// H1 = SHA256(password)
	h1 := sha256.Sum256([]byte(password))
	h1Str := hex.EncodeToString(h1[:])

	// Proof = SHA256(H1 + Nonce)
	proofRaw := sha256.Sum256([]byte(h1Str + nonce))
	proof := hex.EncodeToString(proofRaw[:])

	// 3. Complete Login
	return a.auth.CompleteLogin(username, nonce, proof, "Desktop Client")
}

// SetPassword updates the admin password
func (a *App) SetPassword(password string) error {
	if a.auth == nil {
		return fmt.Errorf("auth service not initialized")
	}
	return a.auth.SetPassword(password)
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
	err := a.manager.AddLibrary(path)
	if err != nil {
		return err
	}
	return nil
}

func (a *App) RemoveConfiguredLibrary(path string) error {
	return a.manager.RemoveLibrary(path)
}

func (a *App) ReorderConfiguredLibraries(paths []string) error {
	return a.manager.SetLibraries(paths)
}

// Server Methods

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

// GetConfig returns the current configuration
func (a *App) GetConfig() *config.Config {
	return a.manager.GetConfig()
}

// CheckForUpdates checks if a new version is available
func (a *App) CheckForUpdates() (*updater.UpdateInfo, error) {
	return updater.GetLatestVersion(a.GetAppVersion())
}

// ApplyUpdate performs the update process
func (a *App) ApplyUpdate(url string) error {
	return updater.ApplyUpdate(url)
}

// SetPublicAccess toggles the Public Access mode
func (a *App) SetPublicAccess(enabled bool) error {
	return a.manager.UpdateConfig(func(cfg *config.Config) {
		cfg.PublicAccess = enabled
	})
}

// SetServerEnabled toggles the HTTP Server on startup
func (a *App) SetServerEnabled(enabled bool) error {
	return a.manager.UpdateConfig(func(cfg *config.Config) {
		cfg.ServerEnabled = enabled
	})
}

// SetServerPort Sets the HTTP Server Port
func (a *App) SetServerPort(port string) error {
	return a.manager.UpdateConfig(func(cfg *config.Config) {
		cfg.ServerPort = port
	})
}

// SetAuthPollInterval sets the polling interval for auth revocation check
func (a *App) SetAuthPollInterval(seconds int) error {
	return a.manager.UpdateConfig(func(cfg *config.Config) {
		cfg.AuthPollInterval = seconds
	})
}

// StartServer manually starts the HTTP Server
func (a *App) StartServer() error {
	cfg := a.manager.GetConfig()
	port := cfg.ServerPort
	if port == "" {
		port = "18888"
	}

	err := a.server.Start(port, cfg.Libraries)
	if err == nil {
		runtime.EventsEmit(a.ctx, "server:status:changed", true)
	}
	return err
}

// StopServer manually stops the HTTP Server
func (a *App) StopServer() error {
	err := a.server.Stop()
	if err == nil {
		runtime.EventsEmit(a.ctx, "server:status:changed", false)
	}
	return err
}

// IsServerRunning returns true if the HTTP server is active
func (a *App) IsServerRunning() bool {
	if a.server == nil {
		return false
	}
	return a.server.IsRunning()
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

	// Wait briefly to allow UI to detach/dialogs to close before killing runtime
	go func() {
		time.Sleep(500 * time.Millisecond)
		runtime.Quit(a.ctx)
	}()
}

// GetChangelog returns the markdown content for the current version
func (a *App) GetChangelog() (string, error) {
	return changelogData, nil
}

// SetLastSeenVersion updates the config with the latest seen version
func (a *App) SetLastSeenVersion(version string) error {
	return a.manager.UpdateConfig(func(cfg *config.Config) {
		cfg.LastSeenVersion = version
	})
}

// ExportSettings opens a dialog to save the settings zip
func (a *App) ExportSettings() (string, error) {
	// Open Save Dialog
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export Settings",
		DefaultFilename: "YAVAM_Backup.zip",
		Filters: []runtime.FileFilter{
			{DisplayName: "Zip Files (*.zip)", Pattern: "*.zip"},
		},
	})

	if err != nil || path == "" {
		return "", err
	}

	// Zip DataPath
	// We need DataPath. manager has it.
	dataPath := a.manager.DataPath
	return path, utils.ZipDirectory(dataPath, path)
}

// ImportSettings imports settings from a zip file and restarts
func (a *App) ImportSettings() error {
	zipPath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Import Settings Backup",
		Filters: []runtime.FileFilter{
			{DisplayName: "Zip Files (*.zip)", Pattern: "*.zip"},
		},
	})
	if err != nil {
		return err
	}
	if zipPath == "" {
		return nil // Cancelled
	}

	// 1. Validate Zip (Simple check: can we open it? utils.UnzipDirectory does checks)
	// But we want to check for config.json presence ideally.
	// For now, let's proceed with UnzipDirectory which is safe against Zip Slip.

	// 2. Wipe current DataPath?
	// If Unzip fails halfway, we might be in trouble.
	// Better: Unzip to temp, then swap.
	tempDir, err := os.MkdirTemp("", "yavam_restore")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)

	if err := utils.UnzipDirectory(zipPath, tempDir); err != nil {
		return fmt.Errorf("failed to unzip backup: %w", err)
	}

	// 3. Verify content
	if _, err := os.Stat(filepath.Join(tempDir, "config.json")); os.IsNotExist(err) {
		return fmt.Errorf("invalid backup: config.json not found")
	}

	// 4. Overwrite DataPath
	// We remove old DataPath contents
	dataPath := a.manager.DataPath

	// Issue: We cannot remove `lock` files if app is running?
	// `auth.json`, `config.json` should be fine.
	// `db` folder might be locked if using sqlite/badger.
	// Yavam uses simple JSON files + LibraryService scanning (no locking DB yet).
	// So it should be safe.

	os.RemoveAll(dataPath)
	// Move tempDir to dataPath is tricky across volumes.
	// CopyDir logic needed?
	// Or just Unzip directly to DataPath after clearing.
	// We validated integrity with temp unzip. Now unzip to real path.
	os.MkdirAll(dataPath, 0755)
	if err := utils.UnzipDirectory(zipPath, dataPath); err != nil {
		return fmt.Errorf("failed to restore: %w", err)
	}

	// 5. Restart
	a.RestartApp()
	return nil
}
