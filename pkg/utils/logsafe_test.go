package utils

import (
	"strings"
	"testing"
	"unicode"
)

func TestSanitizeForLogStripsControlCharactersAndQuotes(t *testing.T) {
	got := SanitizeForLog("phone\r\n[12:00:00] fake line\x00\x1b[31m\t")

	for _, r := range got {
		if unicode.IsControl(r) {
			t.Fatalf("control character %U survived in %q", r, got)
		}
	}
	if !strings.HasPrefix(got, `"`) || !strings.HasSuffix(got, `"`) {
		t.Errorf("result must be quoted, got %s", got)
	}
}

func TestSanitizeForLogStripsFormatCharacters(t *testing.T) {
	zeroWidthSpace, bidiOverride, wordJoiner := string(rune(0x200B)), string(rune(0x202E)), string(rune(0x2060))
	got := SanitizeForLog("ad" + zeroWidthSpace + "min" + bidiOverride + "gnp" + wordJoiner)
	if got != `"admingnp"` {
		t.Errorf("format characters must be dropped, got %s", got)
	}
}

func TestSanitizeForLogEscapesQuotes(t *testing.T) {
	got := SanitizeForLog(`a" injected="1`)
	inner := strings.ReplaceAll(got[1:len(got)-1], `\"`, "")
	if strings.Contains(inner, `"`) {
		t.Errorf("embedded quote must be escaped, got %s", got)
	}
}

func TestSanitizeForLogCapsLength(t *testing.T) {
	got := SanitizeForLog(strings.Repeat("a", 500))
	if len(got) > maxLoggedValueLength+2 {
		t.Errorf("expected at most %d characters plus quotes, got %d", maxLoggedValueLength, len(got))
	}
}
