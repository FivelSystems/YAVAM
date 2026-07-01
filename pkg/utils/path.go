package utils

import (
	"path/filepath"
	"strings"
)

// CanonPath is the single definition of "the same path" on YAVAM's
// case-insensitive (Windows) target: it maps casing/format variants of one
// folder to one key so that "D:\VaM" and "d:\vam" compare equal. Used as a
// lookup/index key and for the ValidatePath security check — never for display
// or filesystem access, which must keep the original path.
func CanonPath(p string) string {
	if p == "" {
		return ""
	}
	return strings.ToLower(filepath.Clean(p))
}
