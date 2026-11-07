package server

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"yavam/pkg/manager"
)

func startUploadTestServer(t *testing.T, libraryDir string) *Server {
	t.Helper()
	mgr := manager.NewManager(nil, nil, &TestServerConfigService{libraries: []string{libraryDir}})
	s := NewServer(context.Background(), mgr, &MockAuthService{validToken: "valid"}, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true
	if err := s.Start("127.0.0.1", "0", []string{libraryDir}); err != nil {
		t.Fatalf("Start() failed: %v", err)
	}
	t.Cleanup(func() { s.Stop() })
	return s
}

func postUpload(t *testing.T, s *Server, libraryDir string, fileNames ...string) int {
	t.Helper()
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	if err := form.WriteField("path", libraryDir); err != nil {
		t.Fatal(err)
	}
	for _, name := range fileNames {
		part, err := form.CreateFormFile("file", name)
		if err != nil {
			t.Fatal(err)
		}
		part.Write([]byte("incoming"))
	}
	form.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/upload", &body)
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.Header.Set("Authorization", "Bearer valid")
	w := httptest.NewRecorder()
	s.httpSrv.Handler.ServeHTTP(w, req)
	return w.Code
}

func listDir(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	return names
}

func TestUpload_AcceptsPackageExtensions(t *testing.T) {
	for _, name := range []string{"A.B.1.var", "A.B.2.var.disabled", "A.B.3.VAR", "A.B.4.Var.Disabled"} {
		t.Run(name, func(t *testing.T) {
			library := t.TempDir()
			s := startUploadTestServer(t, library)
			if code := postUpload(t, s, library, name); code != http.StatusOK {
				t.Fatalf("expected 200, got %d", code)
			}
			if _, err := os.Stat(filepath.Join(library, name)); err != nil {
				t.Fatalf("uploaded file missing: %v", err)
			}
		})
	}
}

func TestUpload_RejectsOtherExtensionsWithoutCreatingFiles(t *testing.T) {
	for _, name := range []string{"a.exe", "a.zip", "a.txt", "noextension", "a.var.exe", "a.var.disabled.exe", "a.var.zip", "a.disabled", ".var", "a.var."} {
		t.Run(name, func(t *testing.T) {
			library := t.TempDir()
			s := startUploadTestServer(t, library)
			if code := postUpload(t, s, library, name); code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", code)
			}
			if names := listDir(t, library); len(names) != 0 {
				t.Fatalf("library should be empty, found %v", names)
			}
		})
	}
}

func TestUpload_OneInvalidFileRejectsWholeRequest(t *testing.T) {
	library := t.TempDir()
	s := startUploadTestServer(t, library)
	if code := postUpload(t, s, library, "A.B.1.var", "evil.exe"); code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", code)
	}
	if names := listDir(t, library); len(names) != 0 {
		t.Fatalf("library should be empty, found %v", names)
	}
}

func TestUpload_DuplicatePackageConflicts(t *testing.T) {
	tests := []struct {
		name     string
		existing string
		incoming string
	}{
		{"enabled over enabled", "A.B.1.var", "A.B.1.var"},
		{"enabled incoming, disabled exists", "A.B.1.var.disabled", "A.B.1.var"},
		{"disabled incoming, enabled exists", "A.B.1.var", "A.B.1.var.disabled"},
		{"case-differing name", "A.B.1.var", "a.b.1.VAR"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			library := t.TempDir()
			existingPath := filepath.Join(library, tt.existing)
			if err := os.WriteFile(existingPath, []byte("original"), 0o644); err != nil {
				t.Fatal(err)
			}
			s := startUploadTestServer(t, library)

			if code := postUpload(t, s, library, tt.incoming); code != http.StatusConflict {
				t.Fatalf("expected 409, got %d", code)
			}
			content, err := os.ReadFile(existingPath)
			if err != nil || string(content) != "original" {
				t.Fatalf("existing package must be untouched, got %q (err %v)", content, err)
			}
			if names := listDir(t, library); len(names) != 1 {
				t.Fatalf("no extra file expected, found %v", names)
			}
		})
	}
}

func TestUpload_ConflictFoundInSubfolder(t *testing.T) {
	library := t.TempDir()
	sub := filepath.Join(library, "Looks")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sub, "A.B.1.var"), []byte("original"), 0o644); err != nil {
		t.Fatal(err)
	}
	s := startUploadTestServer(t, library)
	if code := postUpload(t, s, library, "A.B.1.var"); code != http.StatusConflict {
		t.Fatalf("expected 409, got %d", code)
	}
}

func TestUpload_NewPackageSucceedsAlongsideOthers(t *testing.T) {
	library := t.TempDir()
	if err := os.WriteFile(filepath.Join(library, "A.B.1.var"), []byte("original"), 0o644); err != nil {
		t.Fatal(err)
	}
	s := startUploadTestServer(t, library)
	if code := postUpload(t, s, library, "A.B.2.var"); code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	if names := listDir(t, library); len(names) != 2 {
		t.Fatalf("expected two packages, found %v", names)
	}
}

func TestUpload_DuplicateOnlyCheckedInTargetLibrary(t *testing.T) {
	target := t.TempDir()
	other := t.TempDir()
	if err := os.WriteFile(filepath.Join(other, "A.B.1.var"), []byte("original"), 0o644); err != nil {
		t.Fatal(err)
	}
	mgr := manager.NewManager(nil, nil, &TestServerConfigService{libraries: []string{target, other}})
	s := NewServer(context.Background(), mgr, &MockAuthService{validToken: "valid"}, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true
	if err := s.Start("127.0.0.1", "0", []string{target, other}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Stop() })

	if code := postUpload(t, s, target, "A.B.1.var"); code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
}

func TestUpload_RejectsUnsafeNamesWithoutCreatingFiles(t *testing.T) {
	names := []string{
		"x.var:payload.var", "foo:bar.var", "NUL.var", "nul.VAR", "COM1.var", "lpt9.var.disabled", "Aux.var",
		"a?b.var", "a*b.var", "a<b.var", "a>b.var", "a|b.var", `a"b.var`, " leading.var",
	}
	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			library := t.TempDir()
			s := startUploadTestServer(t, library)
			if code := postUpload(t, s, library, name); code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", code)
			}
			if found := listDir(t, library); len(found) != 0 {
				t.Fatalf("library should be empty, found %v", found)
			}
		})
	}
}

func TestUpload_AcceptsNormalNames(t *testing.T) {
	library := t.TempDir()
	s := startUploadTestServer(t, library)
	if code := postUpload(t, s, library, "Creator.Package.1.var", "Creator.Pack with spaces.2.var"); code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	if found := listDir(t, library); len(found) != 2 {
		t.Fatalf("expected two packages, found %v", found)
	}
}

func TestUpload_TooManyFilesRejected(t *testing.T) {
	library := t.TempDir()
	s := startUploadTestServer(t, library)
	names := make([]string, maxUploadFilesPerRequest+1)
	for i := range names {
		names[i] = fmt.Sprintf("A.B.%d.var", i)
	}
	if code := postUpload(t, s, library, names...); code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d", code)
	}
	if found := listDir(t, library); len(found) != 0 {
		t.Fatalf("library should be empty, found %v", found)
	}
}

func TestUpload_OversizedRequestRejected(t *testing.T) {
	library := t.TempDir()
	s := startUploadTestServer(t, library)

	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	form.WriteField("path", library)
	part, _ := form.CreateFormFile("file", "A.B.1.var")
	part.Write(bytes.Repeat([]byte("x"), 4096))
	form.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/upload", &body)
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.Header.Set("Authorization", "Bearer valid")
	w := httptest.NewRecorder()

	original := uploadRequestLimit
	uploadRequestLimit = 1024
	t.Cleanup(func() { uploadRequestLimit = original })

	s.httpSrv.Handler.ServeHTTP(w, req)
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d", w.Code)
	}
	if found := listDir(t, library); len(found) != 0 {
		t.Fatalf("library should be empty, found %v", found)
	}
}

func TestUpload_WriteFailureRollsBackAndReturns500(t *testing.T) {
	library := t.TempDir()
	s := startUploadTestServer(t, library)

	calls := 0
	original := saveUploadFile
	saveUploadFile = func(destination string, header *multipart.FileHeader) error {
		calls++
		if calls == 2 {
			return errors.New("disk failure")
		}
		return original(destination, header)
	}
	t.Cleanup(func() { saveUploadFile = original })

	if code := postUpload(t, s, library, "A.B.1.var", "A.B.2.var", "A.B.3.var"); code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", code)
	}
	if found := listDir(t, library); len(found) != 0 {
		t.Fatalf("files from the failed request must be removed, found %v", found)
	}
}

func TestUpload_ConflictMidBatchRollsBackAndReturns409(t *testing.T) {
	library := t.TempDir()
	s := startUploadTestServer(t, library)
	collidingPath := filepath.Join(library, "A.B.2.var")

	calls := 0
	original := saveUploadFile
	saveUploadFile = func(destination string, header *multipart.FileHeader) error {
		calls++
		if calls == 2 {
			if err := os.WriteFile(collidingPath, []byte("original"), 0o644); err != nil {
				t.Fatal(err)
			}
		}
		return original(destination, header)
	}
	t.Cleanup(func() { saveUploadFile = original })

	if code := postUpload(t, s, library, "A.B.1.var", "A.B.2.var"); code != http.StatusConflict {
		t.Fatalf("expected 409, got %d", code)
	}
	found := listDir(t, library)
	if len(found) != 1 || found[0] != "A.B.2.var" {
		t.Fatalf("only the pre-existing colliding file should remain, found %v", found)
	}
	if content, _ := os.ReadFile(collidingPath); string(content) != "original" {
		t.Fatalf("colliding file must be untouched, got %q", content)
	}
}

func TestUpload_SameIdentityTwiceInOneRequestConflicts(t *testing.T) {
	library := t.TempDir()
	s := startUploadTestServer(t, library)
	if code := postUpload(t, s, library, "A.B.1.var", "A.B.1.var.disabled"); code != http.StatusConflict {
		t.Fatalf("expected 409, got %d", code)
	}
	if names := listDir(t, library); len(names) != 0 {
		t.Fatalf("library should be empty, found %v", names)
	}
}
