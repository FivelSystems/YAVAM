package utils

import (
	"errors"
	"strings"
)

const (
	EnabledPackageSuffix  = ".var"
	DisabledPackageSuffix = ".var.disabled"
)

// ErrInvalidPackageFileName is returned for names that are unsafe to create on
// a Windows file system.
var ErrInvalidPackageFileName = errors.New("invalid package file name")

const windowsIllegalFileNameChars = `<>:"/\|?*`

var windowsReservedDeviceNames = map[string]bool{
	"CON": true, "PRN": true, "AUX": true, "NUL": true,
	"CONIN$": true, "CONOUT$": true,
	"COM1": true, "COM2": true, "COM3": true, "COM4": true, "COM5": true,
	"COM6": true, "COM7": true, "COM8": true, "COM9": true,
	"COM¹": true, "COM²": true, "COM³": true,
	"LPT1": true, "LPT2": true, "LPT3": true, "LPT4": true, "LPT5": true,
	"LPT6": true, "LPT7": true, "LPT8": true, "LPT9": true,
	"LPT¹": true, "LPT²": true, "LPT³": true,
}

// PackageIdentity returns the key under which a package file name is the same
// package regardless of enabled/disabled state or casing ("X.var",
// "X.var.disabled" and "x.VAR" share one identity). ok is false when the name
// is not a package file or has no base name.
func PackageIdentity(fileName string) (identity string, ok bool) {
	lower := strings.ToLower(fileName)
	for _, suffix := range []string{DisabledPackageSuffix, EnabledPackageSuffix} {
		if strings.HasSuffix(lower, suffix) {
			identity = strings.TrimSuffix(lower, suffix)
			return identity, identity != ""
		}
	}
	return "", false
}

// ValidateUploadFileName is the strict, platform-independent check applied to
// names of files about to be created. It is deliberately separate from
// PackageIdentity so names of packages that already exist keep scanning.
// It returns ErrInvalidPackageFileName for names Windows cannot store as plain
// files: illegal characters, reserved device names, or surrounding spaces.
func ValidateUploadFileName(fileName string) error {
	if fileName != strings.TrimSpace(fileName) {
		return ErrInvalidPackageFileName
	}
	if strings.ContainsAny(fileName, windowsIllegalFileNameChars) || strings.IndexFunc(fileName, isControlRune) >= 0 {
		return ErrInvalidPackageFileName
	}

	identity, ok := PackageIdentity(fileName)
	if !ok {
		return ErrInvalidPackageFileName
	}
	firstSegment, _, _ := strings.Cut(identity, ".")
	if isReservedDeviceName(identity) || isReservedDeviceName(firstSegment) {
		return ErrInvalidPackageFileName
	}
	return nil
}

func isControlRune(r rune) bool { return r < 0x20 }

// isReservedDeviceName ignores trailing spaces and dots because Windows strips
// them before matching.
func isReservedDeviceName(name string) bool {
	trimmed := strings.TrimRight(name, " .")
	return windowsReservedDeviceNames[strings.ToUpper(trimmed)]
}
