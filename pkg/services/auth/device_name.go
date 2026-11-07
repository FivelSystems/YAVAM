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
)

// sanitizeDeviceName strips control characters, trims, caps the length and
// substitutes fallback when nothing printable is left. Every path that creates
// a session goes through it, so stored names are always safe to display and log.
func sanitizeDeviceName(name, fallback string) string {
	printable := strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, name)
	trimmed := strings.TrimSpace(printable)
	if utf8.RuneCountInString(trimmed) > maxDeviceNameLength {
		trimmed = strings.TrimSpace(string([]rune(trimmed)[:maxDeviceNameLength]))
	}
	if trimmed == "" {
		return fallback
	}
	return trimmed
}
