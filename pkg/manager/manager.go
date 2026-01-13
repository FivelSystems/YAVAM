package manager

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"yavam/pkg/models"
	"yavam/pkg/services/config"
	"yavam/pkg/services/library"
	"yavam/pkg/services/system"
)

type Manager struct {
	// Scanner removed (moved to service)
	system   system.SystemService
	library  library.LibraryService
	mu       sync.Mutex
	DataPath string
	config   config.ConfigService
}

func NewManager(sys system.SystemService, lib library.LibraryService, cfg config.ConfigService) *Manager {
	configDir, _ := os.UserConfigDir()
	// Standard Location: %AppData%\YAVAM
	dataPath := filepath.Join(configDir, "YAVAM")
	os.MkdirAll(dataPath, 0755)

	if sys == nil {
		sys = system.NewSystemService(nil)
	}
	if lib == nil {
		// Default to file based library service
		// We need to construct it. It needs sys and fs.
		// Since we don't have fs here directly anymore (it's inside sys),
		// we might need to expose fs from sys or just create a new fs instance.
		// Simply creating a new WindowsFileSystem is safe.
		// OR we change NewManager sig to take everything or rely on caller (main.go).
		// Let's assume caller provides it, or we create default.
		lib = library.NewLibraryService(sys, nil)
	}

	m := &Manager{
		system:   sys,
		library:  lib,
		config:   cfg,
		DataPath: dataPath,
	}

	return m
}

// ScanAndAnalyze delegates to LibraryService
func (m *Manager) ScanAndAnalyze(ctx context.Context, rootPath string, onPackage func(models.VarPackage), onProgress func(int, int)) error {
	return m.library.Scan(ctx, rootPath, onPackage, onProgress)
}

// GetPackageContents delegates to LibraryService
func (m *Manager) GetPackageContents(pkgPath string) ([]models.PackageContent, error) {
	return m.library.GetPackageContents(pkgPath)
}

// DisableOldVersions disables all versions of a package except the latest
// DisableOldVersions delegates to LibraryService
func (m *Manager) DisableOldVersions(pkgs []models.VarPackage, creator string, packageName string, vamPath string) error {
	return m.library.DisableOldVersions(creator, packageName, vamPath)
}

// TogglePackage delegates to LibraryService to rename packages between .var and .var.disabled
func (m *Manager) TogglePackage(pkgs []models.VarPackage, pkgID string, enable bool, vamPath string, merge bool) (string, error) {
	// Note: LibraryService.Toggle doesn't support 'merge' or 'vamPath' currently.
	// We might need to update the service or just pass pkgID (which is path).
	return m.library.Toggle(pkgID, enable)
}

// InstallPackage delegates to LibraryService to copy files to the library. Overwrite is forced.
func (m *Manager) InstallPackage(files []string, vamPath string, onProgress func(current, total int)) ([]string, error) {
	return m.library.Install(files, vamPath, true, func(c, t int, f string) {
		if onProgress != nil {
			onProgress(c, t)
		}
	})
}

func (m *Manager) checkDependencies(pkgs []models.VarPackage) []models.VarPackage {
	return m.library.CheckDependencies(pkgs)
}

// validatePath ensures the path is within the allowed root
func (m *Manager) validatePath(path string, root string) bool {
	// Basic check: resolve absolute paths and ensure prefix matches
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return false
	}
	if strings.HasPrefix(rel, "..") {
		return false
	}

	// Check extension
	lowerPath := strings.ToLower(path)
	if !strings.HasSuffix(lowerPath, ".var") && !strings.HasSuffix(lowerPath, ".var.disabled") {
		return false
	}

	return true
}

// User Configuration Methods

// OpenFolder opens the folder containing the file in File Explorer
// OpenFolder opens the folder containing the file in File Explorer securely
// OpenFolder opens the folder containing the file in File Explorer securely
func (m *Manager) OpenFolder(path string) error {
	cleanPath := filepath.Clean(path)
	return m.system.OpenFolder(cleanPath)
}

func (m *Manager) DeleteToTrash(path string) error {
	return m.system.DeleteToTrash(path)
}

// CopyFileToClipboard copies the file object to the clipboard (so it can be pasted in Explorer)
func (m *Manager) CopyFileToClipboard(path string) error {
	return m.system.CopyFileToClipboard(path)
}

// CutFileToClipboard copies the file to clipboard with "Move" effect (Cut)
// CutFileToClipboard copies the file to clipboard with "Move" effect (Cut)
func (m *Manager) CutFileToClipboard(path string) error {
	return m.system.CutFileToClipboard(path)
}

// DownloadPackage copies the package to the destination folder
func (m *Manager) DownloadPackage(pkgPath string, destDir string) error {
	// Check source
	sourceFile, err := os.Open(pkgPath)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	// Ensure destination directory exists
	// os.Stat returns error if not exists
	if _, err := os.Stat(destDir); os.IsNotExist(err) {
		return fmt.Errorf("destination directory does not exist: %s", destDir)
	}

	// Create destination file
	fileName := filepath.Base(pkgPath)
	destPath := filepath.Join(destDir, fileName)

	destFile, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}

// ResolveConflicts handles deduplication and cleanup of conflicting packages
// Delegates to LibraryService
func (m *Manager) ResolveConflicts(keepPath string, others []string, libraryPath string) (*models.ResolveConflictResult, error) {
	return m.library.ResolveConflicts(keepPath, others, libraryPath)
}

// CopyPackagesToLibrary copies a list of package files to a destination library
// Returns list of collided filenames (if overwrite=false) or error
func (m *Manager) CopyPackagesToLibrary(filePaths []string, destLibPath string, overwrite bool, onProgress func(current, total int, filename string, status string)) ([]string, error) {
	fmt.Printf("[Manager] CopyPackagesToLibrary called. Dest: %s, Overwrite: %v, Count: %d\n", destLibPath, overwrite, len(filePaths))

	var collisions []string
	filesToInstall := filePaths

	// 1. If not overwriting, identify collisions and filter them out
	if !overwrite {
		cols, err := m.library.CheckCollisions(filePaths, destLibPath)
		if err != nil {
			return nil, err
		}
		if len(cols) > 0 {
			collisions = cols
			// Filter out collisions from filesToInstall
			// This is inefficient O(N*M) but N is small (drag drop)
			var filtered []string
			colMap := make(map[string]bool)
			for _, c := range collisions {
				colMap[c] = true
			}
			for _, f := range filePaths {
				base := filepath.Base(f)
				if colMap[base] {
					// Emit "skipped" event for UI
					if onProgress != nil {
						onProgress(0, 0, base, "skipped")
					}
				} else {
					filtered = append(filtered, f)
				}
			}
			filesToInstall = filtered
		}
	}

	// 2. Install the rest
	if len(filesToInstall) > 0 {
		// Wrap progress to match signature
		wrapperProgress := func(cur, tot int, filename string) {
			if onProgress != nil {
				onProgress(cur, tot, filename, "installing")
			}
		}

		// We use overwrite=true for the filtered list because we already handled collisions manually
		// Or overwrite=overwrite (which is false), but list is filtered so it shouldn't matter.
		// Using overwrite=true ensures we force copy the 'safe' ones.
		_, err := m.library.Install(filesToInstall, destLibPath, true, wrapperProgress)
		if err != nil {
			// If error mentions "ignored", it might be partial success.
			// Ideally we return collisions (if any) and the error.
			return collisions, err
		}
	}

	return collisions, nil
}

// FinishSetup marks the application as configured
func (m *Manager) FinishSetup() error {
	marker := filepath.Join(m.DataPath, ".setup_complete")
	return os.WriteFile(marker, []byte("done"), 0644)
}

// IsConfigured checks if the application setup is complete
func (m *Manager) IsConfigured() bool {
	marker := filepath.Join(m.DataPath, ".setup_complete")
	_, err := os.Stat(marker)
	return err == nil
}

func (m *Manager) GetLibraryCounts(libraries []string) map[string]int {
	return m.library.GetCounts(libraries)
}

type DiskSpaceInfo struct {
	Free      uint64 `json:"free"`
	Total     uint64 `json:"total"`
	TotalFree uint64 `json:"totalFree"`
}

func (m *Manager) GetDiskSpace(path string) (DiskSpaceInfo, error) {
	info, err := m.system.GetDiskSpace(path)
	if err != nil {
		return DiskSpaceInfo{}, err
	}

	return DiskSpaceInfo{
		Free:      info.Free,
		Total:     info.Total,
		TotalFree: info.TotalFree,
	}, nil
}

// CheckCollisions checks if files already exist in the destination library without copying
// CheckCollisions delegates to LibraryService
func (m *Manager) CheckCollisions(filePaths []string, destLibPath string) ([]string, error) {
	return m.library.CheckCollisions(filePaths, destLibPath)
}
