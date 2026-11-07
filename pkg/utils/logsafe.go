package utils

import (
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"
)

const maxLoggedValueLength = 64

// SanitizeForLog makes client-supplied text safe to put in a log line: control
// characters are dropped, the length is capped, and the result is quoted so it
// cannot imitate surrounding log structure.
func SanitizeForLog(value string) string {
	printable := strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || r == utf8.RuneError {
			return -1
		}
		return r
	}, value)

	if utf8.RuneCountInString(printable) > maxLoggedValueLength {
		printable = string([]rune(printable)[:maxLoggedValueLength])
	}
	return fmt.Sprintf("%q", printable)
}
