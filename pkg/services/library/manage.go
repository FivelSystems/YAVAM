package library

import (
	"errors"
	"fmt"
	"os"
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
