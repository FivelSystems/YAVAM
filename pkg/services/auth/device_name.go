package auth

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	maxDeviceNameLength = 64
	defaultDeviceName   = "Unknown Device"
	pairedDeviceName    = "Paired Device"
	localSystemDevice   = "Local System"

	minDeviceIDLength = 16
	maxDeviceIDLength = 64
)

// reservedDeviceNames are shown for sessions the application itself creates. A
// client may never claim one, or a remote device could pass for the local one.
var reservedDeviceNames = []string{localSystemDevice}

// sanitizeDeviceName strips control and format characters (zero-width, bidi
// overrides), trims, caps the length and substitutes fallback when nothing
// printable is left or the name is reserved. Every path that creates a client
// session goes through it, so stored names are safe to display and log. The
// name is only a label: nothing may decide trust from it.
func sanitizeDeviceName(name, fallback string) string {
	printable := strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) || unicode.Is(unicode.Zl, r) || unicode.Is(unicode.Zp, r) {
			return -1
		}
		return r
	}, name)
	trimmed := strings.TrimSpace(printable)
	if utf8.RuneCountInString(trimmed) > maxDeviceNameLength {
		trimmed = strings.TrimSpace(string([]rune(trimmed)[:maxDeviceNameLength]))
	}
	if trimmed == "" || isReservedDeviceName(trimmed) {
		return fallback
	}
	return trimmed
}

func isReservedDeviceName(name string) bool {
	collapsed := strings.Join(strings.Fields(name), " ")
	for _, reserved := range reservedDeviceNames {
		if strings.EqualFold(collapsed, reserved) {
			return true
		}
	}
	return false
}

// sanitizeDeviceID returns id when it is a well-formed client-held device
// identifier (16-64 characters of A-Z a-z 0-9 _ -) and "" otherwise, so an
// invalid or absent identifier simply means the session replaces nothing.
func sanitizeDeviceID(id string) string {
	if len(id) < minDeviceIDLength || len(id) > maxDeviceIDLength {
		return ""
	}
	for i := 0; i < len(id); i++ {
		c := id[i]
		isAllowed := c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-'
		if !isAllowed {
			return ""
		}
	}
	return id
}
