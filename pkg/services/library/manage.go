package library

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// Toggle renames a package between .var and .var.disabled
func (s *defaultLibraryService) Toggle(pkgPath string, enable bool) (string, error) {
	sourcePath := pkgPath

	// Prepare new path
	var destPath string

	if enable {
		// We expect source to end in .var.disabled
		if strings.HasSuffix(strings.ToLower(sourcePath), ".var.disabled") {
			destPath = sourcePath[:len(sourcePath)-len(".disabled")]
		} else if strings.HasSuffix(strings.ToLower(sourcePath), ".var") {
			return sourcePath, nil // Already enabled
		} else {
			return "", fmt.Errorf("invalid file extension for enabling")
		}
	} else {
		// Disable
		// We expect source to end in .var
		if strings.HasSuffix(strings.ToLower(sourcePath), ".var") {
			destPath = sourcePath + ".disabled"
		} else if strings.HasSuffix(strings.ToLower(sourcePath), ".var.disabled") {
			return sourcePath, nil // Already disabled
		} else {
			return "", fmt.Errorf("invalid file extension for disabling")
		}
	}

	// Check if destination already exists (collide)
	if _, err := os.Stat(destPath); err == nil {
		if !enable {
			// If Disabling and target exists, it's safe to overwrite the disabled copy
			if err := os.Remove(destPath); err != nil {
				return "", fmt.Errorf("failed to overwrite existing disabled package: %v", err)
			}
		} else {
			// If Enabling and target exists, fail (caller should handle collision/merging explicitely via ResolveConflicts?)
			// The original TogglePackage had a 'merge' flag.
			// Implementing 'merge' logic here or forcing caller to handle it?
			// The interface defined 'Toggle(pkgPath, enable)'. It ignored 'merge' and 'vamPath'.
			// I should match original behavior or keep it simple.
			// Let's assume for now we error, and `ResolveConflicts` handles the merge case separately.
			// OR we assume simple toggle for now.
			return "", fmt.Errorf("cannot enable: a package with the same name is already active")
		}
	}

	if err := os.Rename(sourcePath, destPath); err != nil {
		return "", err
	}

	return destPath, nil
}

// DisableOldVersions disables all versions of a package except the latest
func (s *defaultLibraryService) DisableOldVersions(creator string, packageName string, libraryPath string) error {
	// CAUTION: This operation requires scanning the library to find all versions.
	// The original Manager.DisableOldVersions took a LIST of packages as input `pkgs []models.VarPackage`.
	// My interface definition `DisableOldVersions(creator, pkgName, libraryPath)` implies re-scanning or using path globs.
	// Globs might be faster than full scan.

	pattern := filepath.Join(libraryPath, fmt.Sprintf("%s.%s.*.var", creator, packageName))
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return err
	}
	// Also check disabled ones? No, we only want to disable enabled ones.

	if len(matches) <= 1 {
		return nil
	}

	// We need to parse versions from filenames
	type pkgVersion struct {
		Path    string
		Version string
		VInt    int
	}
	var versions []pkgVersion

	for _, m := range matches {
		base := filepath.Base(m)
		// expected: Creator.Package.Version.var
		parts := strings.Split(base, ".")
		if len(parts) >= 4 { // c.p.v.var
			vStr := parts[len(parts)-2] // 2nd to last
			vInt, _ := strconv.Atoi(vStr)
			versions = append(versions, pkgVersion{Path: m, Version: vStr, VInt: vInt})
		}
	}

	// Sort
	sort.Slice(versions, func(i, j int) bool {
		if versions[i].VInt != versions[j].VInt {
			return versions[i].VInt > versions[j].VInt // Descending
		}
		return versions[i].Version > versions[j].Version
	})

	// Keep first, disable others
	if len(versions) > 0 {
		for _, v := range versions[1:] {
			s.Toggle(v.Path, false)
		}
	}

	return nil
}
