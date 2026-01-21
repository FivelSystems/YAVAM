package library

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Install copies a list of files to the target library folder
func (s *defaultLibraryService) Install(files []string, targetLib string, overwrite bool, onProgress func(current, total int, filename string)) ([]string, error) {
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
	spaceInfo, err := s.system.GetDiskSpace(targetLib)
	if err == nil {
		if spaceInfo.Free < totalSize {
			return nil, fmt.Errorf("insufficient disk space: need %d bytes, have %d bytes available", totalSize, spaceInfo.Free)
		}
	}

	// Install directly to the repository root
	destDir := targetLib
	totalFiles := len(files)

	for i, f := range files {
		func() {
			fileName := filepath.Base(f)
			// Emit Progress at the END of processing this file
			defer func() {
				if onProgress != nil {
					onProgress(i+1, totalFiles, fileName)
				}
			}()

			lowerName := strings.ToLower(fileName)
			if !strings.HasSuffix(lowerName, ".var") && !strings.HasSuffix(lowerName, ".var.disabled") {
				ignored = append(ignored, fileName)
				return // continue loop
			}

			destPath := filepath.Join(destDir, fileName)

			// Check for collision if overwrite is false
			if !overwrite {
				if info, err := os.Stat(destPath); err == nil && !info.IsDir() {
					// Collision found, check if it's the exact same file first to avoid false alarm
					if srcInfo, err := os.Stat(f); err == nil {
						if os.SameFile(srcInfo, info) {
							return // continue
						}
					}
					// Skip
					ignored = append(ignored, fmt.Sprintf("%s (skipped: exists)", fileName))
					return // continue
				}
			} else {
				// Self-overwrite prevention
				if pkgInfo, err := os.Stat(f); err == nil {
					if destInfo, err := os.Stat(destPath); err == nil {
						if os.SameFile(pkgInfo, destInfo) {
							return // continue
						}
					}
				}
			}

			// COPY OPERATION
			srcFile, err := os.Open(f)
			if err != nil {
				ignored = append(ignored, fmt.Sprintf("%s (read error: %v)", fileName, err))
				return // continue
			}

			// Ensure we close srcFile if we return early (failed create)
			// But we defer progress... wait, srcFile needs to be closed inside this scope.
			// defer srcFile.Close() is dangerous if we return early? No, it runs on return.
			// We handle explicit Close in code, let's stick to that or use defer carefully.
			// Existing code uses manual Close(). Let's adapt.

			destFile, err := os.Create(destPath)
			if err != nil {
				srcFile.Close()
				if strings.Contains(err.Error(), "Access is denied") || strings.Contains(err.Error(), "user name or password") {
					ignored = append(ignored, fmt.Sprintf("%s (Access Denied. Please log in to the folder.)", fileName))
				} else {
					ignored = append(ignored, fmt.Sprintf("%s (create error: %v)", fileName, err))
				}
				return // continue
			}

			_, err = io.Copy(destFile, srcFile)
			srcFile.Close()
			destFile.Close()

			if err != nil {
				ignored = append(ignored, fmt.Sprintf("%s (copy error: %v)", fileName, err))
				return // continue
			}

			installed = append(installed, destPath)
		}()
	}

	if len(ignored) > 0 {
		return installed, fmt.Errorf("the following files were ignored or skipped: %s", strings.Join(ignored, ", "))
	}

	return installed, nil
}

// CheckCollisions checks if files already exist in the destination library without copying
func (s *defaultLibraryService) CheckCollisions(filePaths []string, destLibPath string) ([]string, error) {
	var collisions []string
	for _, src := range filePaths {
		baseName := filepath.Base(src)
		dest := filepath.Join(destLibPath, baseName)
		if info, err := os.Stat(dest); err == nil && !info.IsDir() {
			collisions = append(collisions, baseName)
		}
	}
	return collisions, nil
}
