package scanner

import (
	"os"
	"path/filepath"
	"strings"
	"yavam/pkg/models"
)

// Scanner handles file system operations
type Scanner struct{}

func NewScanner() *Scanner {
	return &Scanner{}
}

// ScanForPackages walks the given directory and returns a list of potential package files.
// It looks for .var and .var.disabled files recursively.
func (s *Scanner) ScanForPackages(vamPath string) ([]models.VarPackage, error) {
	// Scan the provided path recursively (Generic Repository Support)
	return s.scanDirectory(vamPath)
}

func (s *Scanner) scanDirectory(root string) ([]models.VarPackage, error) {
	var pkgs []models.VarPackage

	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			// If we can't access the root, we must fail.
			if path == root {
				return err
			}
			return nil // Skip errors for sub-items
		}

		if info.IsDir() {
			return nil
		}

		lowerName := strings.ToLower(info.Name())
		var isEnabled bool

		if strings.HasSuffix(lowerName, ".var") {
			isEnabled = true
		} else if strings.HasSuffix(lowerName, ".var.disabled") {
			isEnabled = false
		} else {
			return nil // Not a var package
		}

		pkg := models.VarPackage{
			FilePath:     path,
			FileName:     info.Name(),
			Size:         info.Size(),
			IsEnabled:    isEnabled,
			CreationDate: info.ModTime().Format("2006-01-02T15:04:05Z07:00"),
		}
		pkgs = append(pkgs, pkg)
		return nil
	})

	return pkgs, err
}

// CountPackages returns the number of .var packages in the directory (recursive)
func (s *Scanner) CountPackages(root string) (int, error) {
	count := 0
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip errors
		}
		if info.IsDir() {
			return nil
		}
		name := strings.ToLower(info.Name())
		if strings.HasSuffix(name, ".var") || strings.HasSuffix(name, ".var.disabled") {
			count++
		}
		return nil
	})
	return count, err
}
