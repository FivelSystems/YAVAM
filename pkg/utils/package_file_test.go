package utils

import "testing"

func TestValidateUploadFileName(t *testing.T) {
	accepted := []string{"Creator.Package.1.var", "Creator.Pack with spaces.2.var", "A.B.2.var.disabled", "A.B.3.VAR", "console.var", "nulled.pkg.1.var", "COM10.var"}
	for _, name := range accepted {
		if err := ValidateUploadFileName(name); err != nil {
			t.Errorf("ValidateUploadFileName(%q) = %v, want nil", name, err)
		}
	}

	rejected := []string{
		"x.var:payload.var", "foo:bar.var", "a<b.var", "a>b.var", `a"b.var`, "a|b.var", "a?b.var", "a*b.var",
		"a/b.var", `a\b.var`, "a\x01b.var", "a\tb.var",
		"NUL.var", "nul.VAR", "COM1.var", "lpt9.var.disabled", "Aux.var", "CON.var", "prn.var",
		"COM¹.var", "LPT³.var", "NUL.something.1.var", "con.pkg.var", "NUL .var",
		" A.B.1.var", "A.B.1.var ", "\tA.B.1.var",
		"a.exe", "noextension", ".var",
	}
	for _, name := range rejected {
		if err := ValidateUploadFileName(name); err == nil {
			t.Errorf("ValidateUploadFileName(%q) = nil, want error", name)
		}
	}
}

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
