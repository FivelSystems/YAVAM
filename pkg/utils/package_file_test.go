package utils

import "testing"

func TestPackageIdentity(t *testing.T) {
	tests := []struct {
		name     string
		wantID   string
		wantOkay bool
	}{
		{"A.B.1.var", "a.b.1", true},
		{"A.B.1.var.disabled", "a.b.1", true},
		{"a.b.1.VAR.DISABLED", "a.b.1", true},
		{"a.var.exe", "", false},
		{".var", "", false},
		{".var.disabled", "", false},
		{"noextension", "", false},
	}
	for _, tt := range tests {
		id, ok := PackageIdentity(tt.name)
		if id != tt.wantID || ok != tt.wantOkay {
			t.Errorf("PackageIdentity(%q) = (%q, %v), want (%q, %v)", tt.name, id, ok, tt.wantID, tt.wantOkay)
		}
	}
}
