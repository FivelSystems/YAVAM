package manager

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"strconv"
	"sync"
	"varmanager/pkg/models"
	"varmanager/pkg/parser"
	"varmanager/pkg/scanner"
)

type UserPreferences struct {
	Favorites []string `json:"favorites"`
	Hidden    []string `json:"hidden"`
}

type ScanResult struct {
	Packages []models.VarPackage `json:"packages"`
	Tags     []string            `json:"tags"`
}

type Manager struct {
	scanner     *scanner.Scanner
	preferences UserPreferences
	prefPath    string
	mu          sync.Mutex
}

func NewManager() *Manager {
	configDir, _ := os.UserConfigDir()
	appDir := filepath.Join(configDir, "VarManager")
	os.MkdirAll(appDir, 0755)

	m := &Manager{
		scanner:  scanner.NewScanner(),
		prefPath: filepath.Join(appDir, "user_preferences.json"),
	}
	m.loadPreferences()
	return m
}

// ScanAndAnalyze performs scanning, parsing, duplicate detection, and dependency checking
func (m *Manager) ScanAndAnalyze(vamPath string) (ScanResult, error) {
	// 1. Scan files
	rawPkgs, err := m.scanner.ScanForPackages(vamPath)
	if err != nil {
		return ScanResult{}, err
	}

	// Snapshot preferences for fast lookup
	m.mu.Lock()
	favMap := make(map[string]bool)
	hideMap := make(map[string]bool)
	for _, f := range m.preferences.Favorites {
		favMap[f] = true
	}
	for _, h := range m.preferences.Hidden {
		hideMap[h] = true
	}
	m.mu.Unlock()

	// 2. Parse Metadata (Concurrent)
	var processedPkgs []models.VarPackage
	var mu sync.Mutex
	var wg sync.WaitGroup

	// Channels for tags
	tagSet := make(map[string]bool)
	var tagMu sync.Mutex

	// Sempahore to limit concurrency
	sem := make(chan struct{}, 20)

	for _, pkg := range rawPkgs {
		wg.Add(1)
		go func(p models.VarPackage) {
			defer wg.Done()
			sem <- struct{}{}        // Acquire
			defer func() { <-sem }() // Release

			meta, thumbBytes, contentType, err := parser.ParseVarMetadata(p.FilePath)
			if err == nil {
				p.Meta = meta
				p.Type = contentType
				p.Tags = meta.Tags
				p.HasThumbnail = len(thumbBytes) > 0
				if p.HasThumbnail {
					p.ThumbnailBase64 = base64.StdEncoding.EncodeToString(thumbBytes)
					fmt.Printf("DEBUG: %s - Thumbnail FOUND (Size: %d bytes)\n", p.FileName, len(thumbBytes))
				} else {
					fmt.Printf("DEBUG: %s - Thumbnail NOT found\n", p.FileName)
				}
				if len(p.Meta.Tags) > 0 {
					fmt.Printf("DEBUG: %s - Tags Found: %v\n", p.FileName, p.Meta.Tags)
				}

				// Fix empty fields from filename if meta is missing or incomplete
				if p.Meta.Creator == "" || p.Meta.PackageName == "" {
					// Fallback to filename parsing
					// Expected format: Creator.Package.Version.var
					// Preserve CASE for display
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
								// Simple Title Case: "artist" -> "Artist"
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
			}

			// Apply User Preferences
			p.IsFavorite = favMap[p.FileName]
			p.IsHidden = hideMap[p.FileName]

			// Collect tags (assuming generic description search for now,
			// checking if dependencies have categories or if we extract from specific json)
			// VaM meta.json doesn't strictly have "tags". Dependencies are keys.

			mu.Lock()
			processedPkgs = append(processedPkgs, p)
			mu.Unlock()

			tagMu.Lock()
			for _, t := range p.Tags {
				tagSet[t] = true
			}
			tagMu.Unlock()

		}(pkg)
	}
	wg.Wait()

	// 3. Duplicate Detection & Missing Dependency Check
	processedPkgs = m.resolveDuplicates(processedPkgs)
	processedPkgs = m.checkDependencies(processedPkgs)

	// 4. Sort alphabetically by FileName for stable UI
	sort.Slice(processedPkgs, func(i, j int) bool {
		return strings.ToLower(processedPkgs[i].FileName) < strings.ToLower(processedPkgs[j].FileName)
	})

	// Convert tags map to slice
	var tags []string
	for t := range tagSet {
		if t != "" {
			tags = append(tags, t)
		}
	}
	sort.Strings(tags)

	return ScanResult{Packages: processedPkgs, Tags: tags}, nil
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
		_, err := m.TogglePackage(pkgs, p.FilePath, false, vamPath)
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
func (m *Manager) TogglePackage(pkgs []models.VarPackage, pkgID string, enable bool, vamPath string) (string, error) {
	// specific implementation: pkgID IS the FilePath
	sourcePath := pkgID

	// Security Check
	if !m.validatePath(sourcePath, vamPath) {
		// validatePath handles basic containment check
		if !strings.HasPrefix(sourcePath, vamPath) {
			return "", fmt.Errorf("security violation: path outside VaM folder")
		}
	}

	// Prepare new path
	var destPath string

	if enable {
		// We expect source to end in .var.disabled
		if strings.HasSuffix(strings.ToLower(sourcePath), ".var.disabled") {
			destPath = sourcePath[:len(sourcePath)-len(".disabled")]
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
		return "", fmt.Errorf("destination file already exists: %s", filepath.Base(destPath))
	}

	if err := os.Rename(sourcePath, destPath); err != nil {
		return "", err
	}

	return destPath, nil
}

// InstallPackage moves a list of files to the AddonPackages folder
func (m *Manager) InstallPackage(files []string, vamPath string) ([]string, error) {
	var installed []string
	var ignored []string

	// Install directly to the repository root
	destDir := vamPath

	for _, f := range files {
		if filepath.Ext(strings.ToLower(f)) != ".var" {
			ignored = append(ignored, filepath.Base(f))
			continue
		}

		fileName := filepath.Base(f)
		destPath := filepath.Join(destDir, fileName)

		// If file is on same drive, Rename (move). If different, Copy might be needed?
		// os.Rename fails across volumes on some OSs.
		// Let's try Rename, if fails, manual Copy+Delete.
		err := os.Rename(f, destPath)
		if err != nil {
			// Fallback: Read/Write
			input, err := os.ReadFile(f)
			if err != nil {
				continue
			}
			err = os.WriteFile(destPath, input, 0644)
			if err != nil {
				continue
			}
			os.Remove(f) // Delete source after copy
		}
		installed = append(installed, destPath)
	}

	if len(ignored) > 0 {
		return installed, fmt.Errorf("the following files are not Virt-A-Mate packages and were ignored: %s", strings.Join(ignored, ", "))
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

func (m *Manager) loadPreferences() {
	m.mu.Lock()
	defer m.mu.Unlock()

	data, err := os.ReadFile(m.prefPath)
	if err != nil {
		return // Ignore error, start empty
	}
	json.Unmarshal(data, &m.preferences)
}

func (m *Manager) savePreferences() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	data, err := json.MarshalIndent(m.preferences, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(m.prefPath, data, 0644)
}

func (m *Manager) ToggleFavorite(pkgName string) error {
	m.mu.Lock()
	exists := false
	for i, name := range m.preferences.Favorites {
		if name == pkgName {
			// Remove
			m.preferences.Favorites = append(m.preferences.Favorites[:i], m.preferences.Favorites[i+1:]...)
			exists = true
			break
		}
	}
	if !exists {
		m.preferences.Favorites = append(m.preferences.Favorites, pkgName)
	}
	m.mu.Unlock() // Unlock before save to avoid deadlock if save uses lock (it does)
	return m.savePreferences()
}

func (m *Manager) ToggleHidden(pkgName string) error {
	m.mu.Lock()
	exists := false
	for i, name := range m.preferences.Hidden {
		if name == pkgName {
			// Remove
			m.preferences.Hidden = append(m.preferences.Hidden[:i], m.preferences.Hidden[i+1:]...)
			exists = true
			break
		}
	}
	if !exists {
		m.preferences.Hidden = append(m.preferences.Hidden, pkgName)
	}
	m.mu.Unlock()
	return m.savePreferences()
}

func (m *Manager) isFavorite(pkgName string) bool {
	// m.mu.Lock() // Caller usually holds lock? No, ScanAndAnalyze doesn't hold m.mu for the whole time.
	// But preferences might be read concurrently?
	// For now, let's just lock briefly.
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, name := range m.preferences.Favorites {
		if name == pkgName {
			return true
		}
	}
	return false
}

func (m *Manager) isHidden(pkgName string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, name := range m.preferences.Hidden {
		if name == pkgName {
			return true
		}
	}
	return false
}
