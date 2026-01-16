package library

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"yavam/pkg/models"
)

// ResolveConflictResult holds statistics about the resolution operation
// Note: This struct is defined in models, but duplicated in manager.go originally. Used models one.

// CheckDependencies analyzes packages for missing dependencies
func (s *defaultLibraryService) CheckDependencies(pkgs []models.VarPackage) []models.VarPackage {
	// Build an index of available package IDs "Creator.Package.Version"
	// And "Creator.Package" (latest)
	available := make(map[string]bool)

	for _, p := range pkgs {
		// strict ID
		id := fmt.Sprintf("%s.%s.%s", p.Meta.Creator, p.Meta.PackageName, p.Meta.Version)
		available[strings.ToLower(id)] = true

		// loose ID (just package existence)
		baseId := fmt.Sprintf("%s.%s", p.Meta.Creator, p.Meta.PackageName)
		available[strings.ToLower(baseId)] = true
	}

	for i := range pkgs {
		var missing []string
		if pkgs[i].Meta.Dependencies != nil {
			for depID := range pkgs[i].Meta.Dependencies {
				// Dependency format in meta.json is "Creator.Package.Version" : "license/url"
				// We check if "Creator.Package.Version" exists
				// VaM also allows "latest" typically handled by game, but meta lists specific version.

				depIDLower := strings.ToLower(depID)

				// Check strict existence
				if !available[depIDLower] {
					// Check if any version of that package exists?
					// Technically missing specific version might be fine if a newer one exists,
					// but strictly it's missing.
					// Let's check if the base package exists at least.
					parts := strings.Split(depIDLower, ".")
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

// ResolveConflicts handles deduplication and cleanup of conflicting packages
func (s *defaultLibraryService) ResolveConflicts(keepPath string, others []string, libraryPath string) (*models.ResolveConflictResult, error) {
	// 1. Get info of the file to keep
	keepInfo, err := os.Stat(keepPath)
	if err != nil {
		return nil, fmt.Errorf("failed to stat keep file: %v", err)
	}

	result := &models.ResolveConflictResult{
		Merged:   0,
		Disabled: 0,
		NewPath:  keepPath,
	}

	// 2. Process conflicting files
	for _, otherPath := range others {
		if otherPath == keepPath {
			continue
		}

		otherInfo, err := os.Stat(otherPath)
		if os.IsNotExist(err) {
			continue // Already gone
		}

		// Merge Check: Exactly same size?
		if otherInfo.Size() == keepInfo.Size() {
			// MATCH! Deleting duplicate
			if err := os.Remove(otherPath); err == nil {
				result.Merged++
			}
		} else {
			// MISMATCH! Disabling
			if !strings.HasSuffix(otherPath, ".disabled") {
				disabledPath := otherPath + ".disabled"
				if err := os.Rename(otherPath, disabledPath); err == nil {
					result.Disabled++
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
				// This implies we are merging FROM a subdirectory or sidecar TO the root.
				// If we are here, we probably should have checked this earlier.
				// But let's check size.
				destInfo, _ := os.Stat(targetPath)
				if destInfo.Size() == keepInfo.Size() {
					// Dest is same. Delete source.
					os.Remove(keepPath)
					result.NewPath = targetPath
					result.Merged++
					return result, nil
				}
				// Dest is different.
				// We should probably backup dest? Or rename source?
				// Original logic was complex here. Let's assume we overwrite if we "Keep" this one?
				// Or fail.
				return result, fmt.Errorf("target file already exists and is different: %s", targetPath)
			}
		}

		// Move
		if err := os.Rename(keepPath, targetPath); err != nil {
			return result, err
		}
		result.NewPath = targetPath
	}

	return result, nil
}
