package library

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// ErrCounterpartExists is returned when enabling or disabling would collide
// with another copy of the same package. The message is shown to users as-is.
var ErrCounterpartExists = errors.New("A copy of this package already exists in the library; remove or resolve the duplicate first.")

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

	if _, err := os.Lstat(destPath); err == nil {
		return "", ErrCounterpartExists
	} else if !os.IsNotExist(err) {
		return "", err
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

	// Keep the newest version; a failure on one file must not stop the others.
	var failures []error
	if len(versions) > 0 {
		for _, v := range versions[1:] {
			if _, err := s.Toggle(v.Path, false); err != nil {
				failures = append(failures, fmt.Errorf("%s: %w", filepath.Base(v.Path), err))
			}
		}
	}

	return errors.Join(failures...)
}
