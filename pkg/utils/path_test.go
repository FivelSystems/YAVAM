package utils

import (
	"path/filepath"
	"testing"
)

func TestCanonPath(t *testing.T) {
	tests := []struct {
		name string
		a    string
		b    string
		same bool
	}{
		{"casing differs", `D:\VaM\Custom`, `d:\vam\custom`, true},
		{"trailing separator", `D:\VaM\Custom`, `D:\VaM\Custom\`, true},
		{"redundant segment", `D:\VaM\Custom`, `D:\VaM\Extra\..\Custom`, true},
		{"genuinely different", `D:\VaM\Custom`, `D:\VaM\Other`, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CanonPath(tt.a) == CanonPath(tt.b)
			if got != tt.same {
				t.Fatalf("CanonPath(%q)==CanonPath(%q): got same=%v, want %v (%q vs %q)",
					tt.a, tt.b, got, tt.same, CanonPath(tt.a), CanonPath(tt.b))
			}
		})
	}

	if CanonPath("") != "" {
		t.Fatalf("empty path must canonicalize to empty")
	}

	// The result is Clean'd (no trailing separator) so it can be used as a stable key.
	if got := CanonPath(`D:\VaM\Custom\`); got != filepath.Clean(`d:\vam\custom`) {
		t.Fatalf("unexpected canonical form: %q", got)
	}
}
