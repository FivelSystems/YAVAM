package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func postJSON(t *testing.T, s *Server, route string, payload interface{}) int {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, route, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer valid")
	w := httptest.NewRecorder()
	s.httpSrv.Handler.ServeHTTP(w, req)
	return w.Code
}

func newLibraryAndOutsideDirs(t *testing.T) (string, string) {
	t.Helper()
	root := t.TempDir()
	libraryDir := filepath.Join(root, "library")
	outsideDir := filepath.Join(root, "outside")
	for _, dir := range []string{libraryDir, outsideDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	return libraryDir, outsideDir
}

func writeTestFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func TestAPI_ToggleValidatesFilePath(t *testing.T) {
	libraryDir, outsideDir := newLibraryAndOutsideDirs(t)
	s := startUploadTestServer(t, libraryDir)
	inside := filepath.Join(libraryDir, "a.var")
	outside := filepath.Join(outsideDir, "b.var")
	writeTestFile(t, inside, "x")
	writeTestFile(t, outside, "x")

	code := postJSON(t, s, "/api/toggle", map[string]interface{}{"filePath": outside, "enable": false, "libraryPath": libraryDir})
	if code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", code)
	}
	if !fileExists(outside) || fileExists(outside+".disabled") {
		t.Fatal("file outside libraries must not be renamed")
	}

	code = postJSON(t, s, "/api/toggle", map[string]interface{}{"filePath": inside, "enable": false, "libraryPath": libraryDir})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	if !fileExists(inside + ".disabled") {
		t.Fatal("library file should be disabled")
	}
}

func TestAPI_ResolveRejectsWholeCallOnAnyInvalidPath(t *testing.T) {
	libraryDir, outsideDir := newLibraryAndOutsideDirs(t)
	s := startUploadTestServer(t, libraryDir)
	keep := filepath.Join(libraryDir, "keep.var")
	duplicate := filepath.Join(libraryDir, "dup.var")
	foreign := filepath.Join(outsideDir, "foreign.var")
	for _, path := range []string{keep, duplicate, foreign} {
		writeTestFile(t, path, "same")
	}

	code := postJSON(t, s, "/api/resolve", map[string]interface{}{
		"keepPath": keep, "others": []string{duplicate, foreign}, "libraryPath": libraryDir,
	})
	if code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", code)
	}
	for _, path := range []string{keep, duplicate, foreign} {
		if !fileExists(path) {
			t.Fatalf("%s must be untouched after rejected call", path)
		}
	}

	code = postJSON(t, s, "/api/resolve", map[string]interface{}{
		"keepPath": keep, "others": []string{duplicate}, "libraryPath": libraryDir,
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	if fileExists(duplicate) || !fileExists(keep) {
		t.Fatal("valid resolve should remove the duplicate and keep the chosen file")
	}
}

func TestAPI_InstallValidatesSourcesAndDestination(t *testing.T) {
	libraryDir, outsideDir := newLibraryAndOutsideDirs(t)
	s := startUploadTestServer(t, libraryDir)
	source := filepath.Join(libraryDir, "a.var")
	foreign := filepath.Join(outsideDir, "b.var")
	writeTestFile(t, source, "x")
	writeTestFile(t, foreign, "x")

	code := postJSON(t, s, "/api/install", map[string]interface{}{
		"filePaths": []string{foreign}, "destLib": libraryDir, "overwrite": true,
	})
	if code != http.StatusForbidden {
		t.Fatalf("source outside libraries: expected 403, got %d", code)
	}
	if fileExists(filepath.Join(libraryDir, "b.var")) {
		t.Fatal("rejected source must not be copied")
	}

	code = postJSON(t, s, "/api/install", map[string]interface{}{
		"filePaths": []string{source}, "destLib": outsideDir, "overwrite": true,
	})
	if code != http.StatusForbidden {
		t.Fatalf("destination outside libraries: expected 403, got %d", code)
	}
	if fileExists(filepath.Join(outsideDir, "a.var")) {
		t.Fatal("nothing may be copied outside the libraries")
	}

	subLibrary := filepath.Join(libraryDir, "sub")
	if err := os.MkdirAll(subLibrary, 0o755); err != nil {
		t.Fatal(err)
	}
	code = postJSON(t, s, "/api/install", map[string]interface{}{
		"filePaths": []string{source}, "destLib": subLibrary, "overwrite": true,
	})
	if code != http.StatusOK {
		t.Fatalf("valid install: expected 200, got %d", code)
	}
	if !fileExists(filepath.Join(subLibrary, "a.var")) {
		t.Fatal("valid install should copy the package")
	}
}
