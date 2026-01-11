package manager

import (
	"archive/zip"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"

	"golang.org/x/sys/windows"

	"varmanager/pkg/models"
	"varmanager/pkg/parser"
	"varmanager/pkg/scanner"
)

type Manager struct {
	scanner  *scanner.Scanner
	mu       sync.Mutex
	DataPath string
	config   *Config
}

func NewManager() *Manager {
	configDir, _ := os.UserConfigDir()
	// Standard Location: %AppData%\YAVAM
	dataPath := filepath.Join(configDir, "YAVAM")
	os.MkdirAll(dataPath, 0755)

	m := &Manager{
		scanner:  scanner.NewScanner(),
		DataPath: dataPath,
	}
	m.LoadConfig()
	return m
}

// ScanAndAnalyze scans the directory and streams results via callbacks
func (m *Manager) ScanAndAnalyze(ctx context.Context, rootPath string, onPackage func(models.VarPackage), onProgress func(int, int)) error {
	rawPkgs, err := m.scanner.ScanForPackages(rootPath)
	if err != nil {
		return err
	}

	total := len(rawPkgs)
	processed := 0
	var wg sync.WaitGroup
	// Callback mutex to ensure sequential writes if the receiver isn't thread-safe
	// (though Wails Emit is, slice append isn't)
	var cbMu sync.Mutex

	// Channels for tags
	tagSet := make(map[string]bool)
	var tagMu sync.Mutex

	// Sempahore to limit concurrency
	sem := make(chan struct{}, 20)

	// Notify initial progress
	if onProgress != nil {
		onProgress(0, total)
	}

	for _, pkg := range rawPkgs {
		// Check cancellation
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		wg.Add(1)
		go func(p models.VarPackage) {
			defer wg.Done()

			select {
			case <-ctx.Done():
				return
			default:
			}

			sem <- struct{}{}        // Acquire
			defer func() { <-sem }() // Release

			select {
			case <-ctx.Done():
				return
			default:
			}

			meta, thumbBytes, categories, err := parser.ParseVarMetadata(p.FilePath)
			if err == nil {
				p.Meta = meta

				// Sort Categories for stability and primary type selection
				// Sort Categories to determine Primary Type (Lowest value wins)
				sort.Slice(categories, func(i, j int) bool {
					prio := func(s string) int {
						switch s {
						// Character Content (Highest Priority)
						case "Look":
							return 0
						case "Clothing":
							return 1
						case "Hair":
							return 2
						case "Skin":
							return 3
						case "Morph":
							return 4
						// Functionality (High Priority)
						case "Script":
							return 5
						// Gameplay/World (Medium Priority)
						case "Scene":
							return 6
						case "Environment": // Forward compatibility
							return 7
						// Generic Assets (Low Priority)
						case "Asset":
							return 8
						default:
							return 99
						}
					}
					pi, pj := prio(categories[i]), prio(categories[j])
					if pi != pj {
						return pi < pj
					}
					return categories[i] < categories[j]
				})
				p.Categories = categories
				if len(categories) > 0 {
					p.Type = categories[0]
				} else {
					p.Type = "Unknown"
				}

				p.Tags = meta.Tags
				p.HasThumbnail = len(thumbBytes) > 0
				// MEMORY OPTIMIZATION: Do NOT load Base64 thumbnail here.
				// It will be served on-demand via API.

				if len(p.Meta.Tags) > 0 {
					// fmt.Printf("DEBUG: %s - Tags Found: %v\n", p.FileName, p.Meta.Tags)
				}
			} else {
				// Parsing failed, ensure basics are safe defaults
				p.Type = "Unknown"
				// fmt.Printf("[Manager] Warning: Failed to parse metadata for %s: %v\n", p.FileName, err)
			}

			// Fix empty fields from filename if meta is missing or incomplete
			// This runs regardless of parse success/failure
			if p.Meta.Creator == "" || p.Meta.PackageName == "" {
				// Fallback to filename parsing
				cleanName := p.FileName

				// Remove extensions case-insensitively
				lower := strings.ToLower(cleanName)
				if strings.HasSuffix(lower, ".var.disabled") {
					cleanName = cleanName[:len(cleanName)-len(".var.disabled")]
				} else if strings.HasSuffix(lower, ".var") {
					cleanName = cleanName[:len(cleanName)-len(".var")]
				}

				parts := strings.Split(cleanName, ".")
				if len(parts) >= 3 {
					if p.Meta.Creator == "" {
						c := parts[0]
						if len(c) > 0 {
							p.Meta.Creator = strings.ToUpper(c[:1]) + c[1:]
						} else {
							p.Meta.Creator = c
						}
					}
					if p.Meta.PackageName == "" {
						pn := parts[1]
						if len(pn) > 0 {
							p.Meta.PackageName = strings.ToUpper(pn[:1]) + pn[1:]
						} else {
							p.Meta.PackageName = pn
						}
					}
					if p.Meta.Version == "" {
						p.Meta.Version = parts[len(parts)-1]
					}
				}
			}

			// Normalize Tags
			var normalizedTags []string
			tagMu.Lock()
			for _, t := range p.Tags {
				lowerT := strings.ToLower(t)
				normalizedTags = append(normalizedTags, lowerT)
				tagSet[lowerT] = true
			}
			tagMu.Unlock()
			p.Tags = normalizedTags

			// Thread-safe callbacks
			select {
			case <-ctx.Done():
				return
			default:
			}

			cbMu.Lock()
			current := processed + 1
			processed = current

			if onPackage != nil {
				onPackage(p)
			}
			if onProgress != nil {
				// Emit progress every 10 items or if finished
				if current%10 == 0 || current == total {
					onProgress(current, total)
				}
			}
			cbMu.Unlock()

		}(pkg)
	}

	wg.Wait()
	return nil
}

func (m *Manager) resolveDuplicates(pkgs []models.VarPackage) []models.VarPackage {
	// Group by "Creator.PackageName"
	grouped := make(map[string][]*models.VarPackage)

	for i := range pkgs {
		// Ignore disabled packages for duplicate counting as requested
		if !pkgs[i].IsEnabled {
			continue
		}

		key := fmt.Sprintf("%s.%s", pkgs[i].Meta.Creator, pkgs[i].Meta.PackageName)
		// If meta is missing strings, fallback to parsing filename?
		// For now assuming meta exists.
		if key == "." {
			continue // skip empty
		}
		grouped[key] = append(grouped[key], &pkgs[i])
	}

	for key, group := range grouped {
		if len(group) > 1 {
			// Mark all as potential duplicates
			// Ideally we sort by version and mark older ones?
			// User wants yellow "Multiple Versions"
			for _, p := range group {
				p.IsDuplicate = true
			}
			// Logic to mark latest?
			// Just marking IsDuplicate = true triggers the Warning UI (Yellow)
			fmt.Printf("Duplicate found for %s: %d versions\n", key, len(group))
		}
	}
	return pkgs
}

// DisableOldVersions disables all versions of a package except the latest
func (m *Manager) DisableOldVersions(pkgs []models.VarPackage, creator string, packageName string, vamPath string) error {
	// 1. Filter packages matching Creator.Package
	var group []*models.VarPackage
	for i := range pkgs {
		if pkgs[i].IsEnabled && pkgs[i].Meta.Creator == creator && pkgs[i].Meta.PackageName == packageName {
			group = append(group, &pkgs[i])
		}
	}

	if len(group) <= 1 {
		return nil // Nothing to do
	}

	// 2. Sort by version (Simple string compare for now, ideally semantic versioning)
	// VaM versions are usually integers, but can be "1.0", "1.2.3"
	// We try to parse as int first, then string compare
	sort.Slice(group, func(i, j int) bool {
		v1, _ := strconv.Atoi(group[i].Meta.Version)
		v2, _ := strconv.Atoi(group[j].Meta.Version)
		if v1 != v2 {
			return v1 > v2 // Descending
		}
		return group[i].Meta.Version > group[j].Meta.Version
	})

	// 3. Keep first (latest), disable others
	latest := group[0]
	for _, p := range group[1:] {
		// Disable
		fmt.Printf("Disabling old version: %s\n", p.FileName)
		_, err := m.TogglePackage(pkgs, p.FilePath, false, vamPath, false)
		if err != nil {
			return err
		}
	}
	fmt.Printf("Kept latest version: %s\n", latest.FileName)
	return nil
}

// TogglePackage moves a package between AddonPackages and AddonPackages_Disabled
// Returns the new path and proper execution status
// TogglePackage renames a package between .var and .var.disabled
// Returns the new path and proper execution status
func (m *Manager) TogglePackage(pkgs []models.VarPackage, pkgID string, enable bool, vamPath string, merge bool) (string, error) {
	// specific implementation: pkgID IS the FilePath
	sourcePath := pkgID

	// Security Check: Ensure file is within the currently active library
	// We Clean paths to handle separator mismatches (e.g. forward vs backslashes)
	if !m.validatePath(filepath.Clean(sourcePath), filepath.Clean(vamPath)) {
		return "", fmt.Errorf("security violation: file '%s' is not within the active library '%s'", sourcePath, vamPath)
	}

	// Prepare new path
	var destPath string

	if enable {
		// We expect source to end in .var.disabled
		if strings.HasSuffix(strings.ToLower(sourcePath), ".var.disabled") {
			if merge {
				// Merge requested: Target the library root
				baseName := filepath.Base(sourcePath[:len(sourcePath)-len(".disabled")])
				destPath = filepath.Join(vamPath, baseName)
			} else {
				destPath = sourcePath[:len(sourcePath)-len(".disabled")]
			}
		} else if strings.HasSuffix(strings.ToLower(sourcePath), ".var") {
			// Already enabled?
			return sourcePath, nil
		} else {
			return "", fmt.Errorf("invalid file extension for enabling")
		}
	} else {
		// Disable
		// We expect source to end in .var
		if strings.HasSuffix(strings.ToLower(sourcePath), ".var") {
			destPath = sourcePath + ".disabled"
		} else if strings.HasSuffix(strings.ToLower(sourcePath), ".var.disabled") {
			// Already disabled
			return sourcePath, nil
		} else {
			return "", fmt.Errorf("invalid file extension for disabling")
		}
	}

	// Check if destination already exists (collide)
	if _, err := os.Stat(destPath); err == nil {
		if !enable {
			// If Disabling and target exists, it's safe to overwrite the disabled copy
			// (User wants to disable this one, and there's already a disabled one? Just replace it)
			if err := os.Remove(destPath); err != nil {
				return "", fmt.Errorf("failed to overwrite existing disabled package: %v", err)
			}
		} else {
			// If Enabling and target exists
			if merge {
				// User Requested Merge: We assume the desired outcome is "Enabled".
				// Since "Enabled" version exists, we remove the "Disabled" source we are toggling FROM.
				// (Effectively deleting the disabled copy, keeping the enabled one)
				if err := os.Remove(sourcePath); err != nil {
					return "", fmt.Errorf("failed to remove source package during merge: %v", err)
				}
				// We return the destPath (the one that already existed)
				return destPath, nil
			}
			return "", fmt.Errorf("cannot enable: a package with the same name is already active")
		}
	}

	if err := os.Rename(sourcePath, destPath); err != nil {
		return "", err
	}

	return destPath, nil
}

// InstallPackage moves a list of files to the AddonPackages folder
func (m *Manager) InstallPackage(files []string, vamPath string, onProgress func(current, total int)) ([]string, error) {
	var installed []string
	var ignored []string

	// 1. Pre-calculate total size for Disk Space Check
	var totalSize uint64
	for _, f := range files {
		info, err := os.Stat(f)
		if err == nil {
			totalSize += uint64(info.Size())
		}
	}

	// 2. Check Disk Space
	spaceInfo, err := m.GetDiskSpace(vamPath)
	if err == nil {
		if spaceInfo.Free < totalSize {
			return nil, fmt.Errorf("insufficient disk space: need %d bytes, have %d bytes available", totalSize, spaceInfo.Free)
		}
	}

	// Install directly to the repository root
	destDir := vamPath
	totalFiles := len(files)

	for i, f := range files {
		// Emit Progress
		if onProgress != nil {
			onProgress(i+1, totalFiles)
		}

		if filepath.Ext(strings.ToLower(f)) != ".var" {
			ignored = append(ignored, filepath.Base(f))
			continue
		}

		fileName := filepath.Base(f)
		destPath := filepath.Join(destDir, fileName)

		// Self-overwrite prevention (Desktop Issue #12)
		// Use os.SameFile for robust physical file checking
		if pkgInfo, err := os.Stat(f); err == nil {
			if destInfo, err := os.Stat(destPath); err == nil {
				if os.SameFile(pkgInfo, destInfo) {
					fmt.Printf("[Skipping] Source and destination are the same file: %s\n", fileName)
					continue
				}
			}
		}

		// COPY OPERATION
		srcFile, err := os.Open(f)
		if err != nil {
			ignored = append(ignored, fmt.Sprintf("%s (read error: %v)", fileName, err))
			continue
		}

		dstFile, err := os.Create(destPath)
		if err != nil {
			srcFile.Close()
			// Refine Permission Errors
			if strings.Contains(err.Error(), "Access is denied") || strings.Contains(err.Error(), "user name or password") {
				ignored = append(ignored, fmt.Sprintf("%s (Access Denied. Please log in to the folder.)", fileName))
			} else {
				ignored = append(ignored, fmt.Sprintf("%s (create error: %v)", fileName, err))
			}
			continue
		}

		_, err = io.Copy(dstFile, srcFile)
		srcFile.Close()
		dstFile.Close()

		if err != nil {
			ignored = append(ignored, fmt.Sprintf("%s (copy error: %v)", fileName, err))
			continue
		}

		installed = append(installed, destPath)
	}

	if len(ignored) > 0 {
		return installed, fmt.Errorf("the following files were ignored: %s", strings.Join(ignored, ", "))
	}

	return installed, nil
}

func (m *Manager) checkDependencies(pkgs []models.VarPackage) []models.VarPackage {
	// Build an index of available package IDs "Creator.Package.Version"
	// And "Creator.Package" (latest)
	available := make(map[string]bool)

	for _, p := range pkgs {
		// strict ID
		id := fmt.Sprintf("%s.%s.%s", p.Meta.Creator, p.Meta.PackageName, p.Meta.Version)
		available[id] = true

		// loose ID (just package existence)
		baseId := fmt.Sprintf("%s.%s", p.Meta.Creator, p.Meta.PackageName)
		available[baseId] = true
	}

	for i := range pkgs {
		var missing []string
		if pkgs[i].Meta.Dependencies != nil {
			for depID := range pkgs[i].Meta.Dependencies {
				// Dependency format in meta.json is "Creator.Package.Version" : "license/url"
				// We check if "Creator.Package.Version" exists
				// VaM also allows "latest" typically handled by game, but meta lists specific version.

				// Check strict existence
				if !available[depID] {
					// Check if any version of that package exists?
					// Technically missing specific version might be fine if a newer one exists,
					// but strictly it's missing.
					// Let's check if the base package exists at least.
					parts := strings.Split(depID, ".")
					if len(parts) >= 2 {
						baseId := fmt.Sprintf("%s.%s", parts[0], parts[1])
						if !available[baseId] {
							missing = append(missing, depID)
						}
					} else {
						missing = append(missing, depID)
					}
				}
			}
		}
		pkgs[i].MissingDeps = missing
	}
	return pkgs
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
func (m *Manager) OpenFolder(path string) error {
	// windows: explorer /select,"path"
	cmd := exec.Command("explorer", "/select,", path)
	return cmd.Start()
}

// DeleteToTrash moves the file to the Recycle Bin using PowerShell
func (m *Manager) DeleteToTrash(path string) error {
	// PowerShell command to delete to recycle bin
	// Add-Type -AssemblyName Microsoft.VisualBasic
	// [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($path, 'OnlyErrorDialogs', 'SendToRecycleBin')

	// Safety check: path exist?
	if _, err := os.Stat(path); err != nil {
		return err
	}

	psCmd := fmt.Sprintf(`
        Add-Type -AssemblyName Microsoft.VisualBasic;
        [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('%s', 'OnlyErrorDialogs', 'SendToRecycleBin')
    `, path)

	cmd := exec.Command("powershell", "-NoProfile", "-Command", psCmd)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Run()
}

// CopyFileToClipboard copies the file object to the clipboard (so it can be pasted in Explorer)
func (m *Manager) CopyFileToClipboard(path string) error {
	// PowerShell: Set-Clipboard -Path "path"
	// Note: Set-Clipboard -Path is available in PS 5.0+
	cmd := exec.Command("powershell", "-NoProfile", "-Command", fmt.Sprintf("Set-Clipboard -Path '%s'", path))
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Run()
}

// CutFileToClipboard copies the file to clipboard with "Move" effect (Cut)
func (m *Manager) CutFileToClipboard(path string) error {
	// To perform a "Cut", we need to set the "Preferred DropEffect" to "Move" (2).
	// PowerShell's Set-Clipboard doesn't support this native flag easily.
	// We use C# via Add-Type.

	psCmd := fmt.Sprintf(`
		Add-Type -AssemblyName System.Windows.Forms
		$paths = [System.Collections.Specialized.StringCollection]::new()
		$paths.Add('%s')
		$data = [System.Windows.Forms.DataObject]::new()
		$data.SetFileDropList($paths)
		
		# 2 = Move, 5 = Copy
		$moveEffect = [byte[]](2, 0, 0, 0)
		$ms = [System.IO.MemoryStream]::new($moveEffect)
		$data.SetData("Preferred DropEffect", $ms)
		
		[System.Windows.Forms.Clipboard]::SetDataObject($data, $true)
	`, path)

	cmd := exec.Command("powershell", "-NoProfile", "-Command", psCmd)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Run()
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

// GetPackageContents scans a .var file and returns a list of its displayable contents
func (m *Manager) GetPackageContents(pkgPath string) ([]models.PackageContent, error) {
	r, err := zip.OpenReader(pkgPath)
	if err != nil {
		return nil, err
	}
	defer r.Close()

	var contents []models.PackageContent
	// Map to store thumbnails found to match them later
	// key: generic path without extension, value: *zip.File
	thumbnails := make(map[string]*zip.File)

	// First pass: Index files and find potential content
	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}

		lowerName := strings.ToLower(f.Name) // internal zip paths are usually forward slashes

		// Index thumbnails
		if strings.HasSuffix(lowerName, ".jpg") || strings.HasSuffix(lowerName, ".png") {
			noExt := strings.TrimSuffix(lowerName, filepath.Ext(lowerName))
			thumbnails[noExt] = f
		}
	}

	// Second pass: Identify Content
	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}

		lowerName := strings.ToLower(f.Name)
		contentType := ""

		// Scenes
		if strings.Contains(lowerName, "saves/scene/") && strings.HasSuffix(lowerName, ".json") {
			contentType = "Scene"
		} else if strings.Contains(lowerName, "saves/person/appearance/") && strings.HasSuffix(lowerName, ".vap") {
			contentType = "Look"
		} else if strings.Contains(lowerName, "custom/clothing/") && strings.HasSuffix(lowerName, ".vap") {
			contentType = "Clothing"
		} else if strings.Contains(lowerName, "custom/hair/") && strings.HasSuffix(lowerName, ".vap") {
			contentType = "Hair"
		} else if strings.Contains(lowerName, "custom/atom/person/morphs/") && (strings.HasSuffix(lowerName, ".vmi") || strings.HasSuffix(lowerName, ".vmb")) {
			contentType = "Morph"
		} else if strings.Contains(lowerName, "custom/assets/") && strings.HasSuffix(lowerName, ".assetbundle") {
			// Only show asset bundles, not every texture
			contentType = "Asset"
		} else if strings.Contains(lowerName, "custom/") && strings.HasSuffix(lowerName, ".vap") {
			// Generic VAP in custom folder (Shoes, etc)
			// Try to infer type from folder name
			parts := strings.Split(lowerName, "/")
			for i, p := range parts {
				if p == "custom" && i+1 < len(parts) {
					cat := parts[i+1]
					if cat != "clothing" && cat != "hair" && cat != "assets" && cat != "atom" {
						contentType = strings.Title(cat)
					}
					break
				}
			}
			if contentType == "" {
				contentType = "Preset"
			}
		}

		if contentType != "" {
			pc := models.PackageContent{
				FilePath: f.Name,
				FileName: filepath.Base(f.Name),
				Type:     contentType,
				Size:     f.FileInfo().Size(),
			}

			// Look for matching thumbnail
			noExt := strings.TrimSuffix(lowerName, filepath.Ext(lowerName))
			if thumbFile, ok := thumbnails[noExt]; ok {
				rc, err := thumbFile.Open()
				if err == nil {
					data, err := io.ReadAll(rc)
					rc.Close()
					if err == nil {
						pc.ThumbnailBase64 = base64.StdEncoding.EncodeToString(data)
					}
				}
			}

			contents = append(contents, pc)
		}
	}

	// Sort contents: Scenes first, then Looks, then others
	sort.Slice(contents, func(i, j int) bool {
		order := map[string]int{"Scene": 0, "Look": 1, "Clothing": 2, "Hair": 3, "Morph": 4, "Skin": 5, "Preset": 6, "Script": 7, "Asset": 8}

		t1 := order[contents[i].Type]
		if t1 == 0 && contents[i].Type != "Scene" {
			t1 = 50
		} // Default for unknown types if not in map (though map covers all knowns)

		t2 := order[contents[j].Type]
		if t2 == 0 && contents[j].Type != "Scene" {
			t2 = 50
		}

		if t1 != t2 {
			return t1 < t2
		}
		return contents[i].FileName < contents[j].FileName
	})

	return contents, nil
}

// ResolveConflictResult holds statistics about the resolution operation
type ResolveConflictResult struct {
	Merged   int    `json:"merged"`
	Disabled int    `json:"disabled"`
	NewPath  string `json:"newPath"`
}

// ResolveConflicts handles deduplication and cleanup of conflicting packages
func (m *Manager) ResolveConflicts(keepPath string, others []string, libraryPath string) (*ResolveConflictResult, error) {
	// 1. Get info of the file to keep
	keepInfo, err := os.Stat(keepPath)
	if err != nil {
		return nil, fmt.Errorf("failed to stat keep file: %v", err)
	}
	fmt.Printf("[ResolveConflicts] Keep: %s (Size: %d)\n", filepath.Base(keepPath), keepInfo.Size())

	result := &ResolveConflictResult{
		Merged:   0,
		Disabled: 0,
		NewPath:  keepPath, // Default to current path if move fails or not needed
	}

	// 2. Process conflicting files
	for _, otherPath := range others {
		if otherPath == keepPath {
			continue
		}

		otherInfo, err := os.Stat(otherPath)
		if os.IsNotExist(err) {
			fmt.Printf("[ResolveConflicts] Duplicate not found: %s\n", otherPath)
			continue // Already gone?
		}

		fmt.Printf("[ResolveConflicts] Comparing with: %s (Size: %d)\n", filepath.Base(otherPath), otherInfo.Size())

		// Merge Check: Exactly same size?
		if otherInfo.Size() == keepInfo.Size() {
			fmt.Println("[ResolveConflicts] MATCH! Deleting duplicate...")
			// IDENTICAL: Delete "other"
			if err := os.Remove(otherPath); err == nil {
				result.Merged++
			} else {
				fmt.Printf("Failed to delete duplicate %s: %v\n", otherPath, err)
			}
		} else {
			fmt.Println("[ResolveConflicts] MISMATCH! Disabling...")
			// DIFFERENT: Disable "other"
			if !strings.HasSuffix(otherPath, ".disabled") {
				disabledPath := otherPath + ".disabled"
				if err := os.Rename(otherPath, disabledPath); err == nil {
					result.Disabled++
				} else {
					fmt.Printf("Failed to disable conflict %s: %v\n", otherPath, err)
				}
			}
		}
	}

	// 3. Move 'keepPath' to Library Root (Standardization)
	// Only if it's not already in the root
	baseName := filepath.Base(keepPath)
	targetPath := filepath.Join(libraryPath, baseName)

	if filepath.Clean(keepPath) != filepath.Clean(targetPath) {
		// Move it
		// Check if target exists
		if _, err := os.Stat(targetPath); err == nil {
			// Target exists. Is it me?
			if filepath.Clean(keepPath) != filepath.Clean(targetPath) {
				// We have a collision at the destination.
				// User Strategy: "Overlap (Lucky Merge)" - Overwrite root with survivor
				fmt.Printf("[ResolveConflicts] Target exists at root. Overwriting: %s\n", targetPath)
				if err := os.Remove(targetPath); err != nil {
					return result, fmt.Errorf("failed to remove existing root file for overwrite: %w", err)
				}
			}
		}

		// Move
		// If target was me, we just skipped the block above (no-op)
		// If target was removed, we move now.
		// If target didn't exist, we move now.
		if filepath.Clean(keepPath) != filepath.Clean(targetPath) { // Double check we still need to move
			if err := os.Rename(keepPath, targetPath); err == nil {
				result.NewPath = targetPath
			} else {
				fmt.Printf("[ResolveConflicts] Failed to move keep file to root: %v\n", err)
				return result, fmt.Errorf("failed to move survivor to root: %w", err)
			}
		}
	}

	return result, nil
}

// CopyPackagesToLibrary copies a list of package files to a destination library
// Returns list of collided filenames (if overwrite=false) or error
// CopyPackagesToLibrary copies a list of package files to a destination library
// Returns list of collided filenames (if overwrite=false) or error
func (m *Manager) CopyPackagesToLibrary(filePaths []string, destLibPath string, overwrite bool, onProgress func(current, total int, filename string, status string)) ([]string, error) {
	fmt.Printf("[Manager] CopyPackagesToLibrary called. Dest: %s, Overwrite: %v, Count: %d\n", destLibPath, overwrite, len(filePaths))
	var collisions []string
	// Ensure destination exists
	addonPath := destLibPath
	if err := os.MkdirAll(addonPath, 0755); err != nil {
		return nil, fmt.Errorf("failed to create destination: %v", err)
	}

	// Combined pass: Check and Copy
	total := len(filePaths)
	for i, src := range filePaths {
		baseName := filepath.Base(src)
		dest := filepath.Join(addonPath, baseName)

		// Check for collision
		if !overwrite {
			if info, err := os.Stat(dest); err == nil && !info.IsDir() {
				fmt.Printf("[Manager] Collision skipping: %s\n", dest)
				collisions = append(collisions, baseName)
				// Emit progress even for skipped items so the bar fills up
				if onProgress != nil {
					onProgress(i+1, total, baseName, "skipped")
				}
				continue
			}
		}

		// Emit "installing" status BEFORE start
		if onProgress != nil {
			onProgress(i+1, total, baseName, "installing")
		}

		// Perform Copy
		err := func() error {
			sourceFile, err := os.Open(src)
			if err != nil {
				return fmt.Errorf("failed to open source %s: %v", baseName, err)
			}
			defer sourceFile.Close()

			destFile, err := os.Create(dest) // Create truncates if exists (which happens if overwrite=true)
			if err != nil {
				return err
			}
			defer destFile.Close()

			if _, err := io.Copy(destFile, sourceFile); err != nil {
				return err
			}
			return nil
		}()

		if err != nil {
			if onProgress != nil {
				onProgress(i+1, total, baseName, "error")
			}
			// Decide: Abort on error or compile errors?
			// Let's log and abort for now to avoid partial messy states on write errors
			return collisions, fmt.Errorf("failed to copy %s: %v", baseName, err)
		}

		// Optional: Emit "installed" if we want to be explicit about success completion
		// But "installing" followed by next file's event implies success.
		// For the UI to show green check, it needs to know it finished.
		// Let's emit "success" or "installed"
		if onProgress != nil {
			onProgress(i+1, total, baseName, "installed")
		}
	}

	return collisions, nil // Success (potentially with some skipped)
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
	results := make(map[string]int)
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, lib := range libraries {
		wg.Add(1)
		go func(path string) {
			defer wg.Done()
			count, _ := m.scanner.CountPackages(path)
			mu.Lock()
			results[path] = count
			mu.Unlock()
		}(lib)
	}

	wg.Wait()
	return results
}

type DiskSpaceInfo struct {
	Free      uint64 `json:"free"`
	Total     uint64 `json:"total"`
	TotalFree uint64 `json:"totalFree"`
}

func (m *Manager) GetDiskSpace(path string) (DiskSpaceInfo, error) {
	var freeBytes, totalBytes, totalFreeBytes uint64

	pathPtr, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return DiskSpaceInfo{}, err
	}

	err = windows.GetDiskFreeSpaceEx(pathPtr, &freeBytes, &totalBytes, &totalFreeBytes)
	if err != nil {
		return DiskSpaceInfo{}, err
	}

	return DiskSpaceInfo{
		Free:      freeBytes,
		Total:     totalBytes,
		TotalFree: totalFreeBytes,
	}, nil
}
