package utils

import "strings"

const (
	EnabledPackageSuffix  = ".var"
	DisabledPackageSuffix = ".var.disabled"
)

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
