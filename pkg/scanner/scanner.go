package scanner

import (
	"os"
	"path/filepath"
	"strings"
	"varmanager/pkg/models"
)

// Scanner handles file system operations
type Scanner struct{}

func NewScanner() *Scanner {
	return &Scanner{}
}

// ScanForPackages walks the given directory and returns a list of potential package files.
// It looks for .var and .var.disabled files in "AddonPackages".
func (s *Scanner) ScanForPackages(vamPath string) ([]models.VarPackage, error) {
	// Scan the provided path recursively (Generic Repository Support)
	return s.scanDirectory(vamPath)
}

func (s *Scanner) scanDirectory(root string) ([]models.VarPackage, error) {
	var pkgs []models.VarPackage

	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip errors to keep scanning
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
			FilePath:  path,
			FileName:  info.Name(),
			Size:      info.Size(),
			IsEnabled: isEnabled,
		}
		pkgs = append(pkgs, pkg)
		return nil
	})

	return pkgs, err
}
