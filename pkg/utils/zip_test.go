package utils

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"
)

func TestZipAndUnzip(t *testing.T) {
	// Setup Temp Dir
	tempDir, err := os.MkdirTemp("", "yavam_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir) // Cleanup

	srcDir := filepath.Join(tempDir, "source")
	destDir := filepath.Join(tempDir, "dest")
	zipFile := filepath.Join(tempDir, "backup.zip")

	// Create source files
	os.Mkdir(srcDir, 0755)
	os.WriteFile(filepath.Join(srcDir, "config.json"), []byte(`{"test":true}`), 0644)
	os.Mkdir(filepath.Join(srcDir, "subdir"), 0755)
	os.WriteFile(filepath.Join(srcDir, "subdir", "data.txt"), []byte("hello world"), 0644)

	// 1. Test Zip
	err = ZipDirectory(srcDir, zipFile)
	if err != nil {
		t.Fatalf("ZipDirectory failed: %v", err)
	}

	if _, err := os.Stat(zipFile); os.IsNotExist(err) {
		t.Fatal("Zip file was not created")
	}

	// 2. Test Unzip
	err = UnzipDirectory(zipFile, destDir)
	if err != nil {
		t.Fatalf("UnzipDirectory failed: %v", err)
	}

	// Verify Contents
	content, err := os.ReadFile(filepath.Join(destDir, "config.json"))
	if err != nil {
		t.Fatal("config.json missing after unzip")
	}
	if string(content) != `{"test":true}` {
		t.Errorf("config.json content mismatch. Got %s", content)
	}

	subContent, err := os.ReadFile(filepath.Join(destDir, "subdir", "data.txt"))
	if err != nil {
		t.Fatal("subdir/data.txt missing after unzip")
	}
	if string(subContent) != "hello world" {
		t.Errorf("data.txt content mismatch. Got %s", subContent)
	}
}

// Security Test: Zip Slip
func TestUnzipSecurity(t *testing.T) {
	// We manually construct a malicious zip
	tempDir, err := os.MkdirTemp("", "yavam_security")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	badZip := filepath.Join(tempDir, "bad.zip")
	destDir := filepath.Join(tempDir, "extract")

	// Create a zip with a file pointing to parent directory
	f, err := os.Create(badZip)
	if err != nil {
		t.Fatal(err)
	}
	w := zip.NewWriter(f)

	// Malicious filename
	// ../bad.txt
	fname := "../bad.txt"
	header := &zip.FileHeader{
		Name:   fname,
		Method: zip.Store,
	}

	writer, err := w.CreateHeader(header)
	if err != nil {
		t.Fatal(err)
	}
	writer.Write([]byte("malicious content"))
	w.Close()
	f.Close()

	// Attempt Unzip
	err = UnzipDirectory(badZip, destDir)
	if err == nil {
		t.Error("Expected error for Zip Slip attempt, but got nil")
	}
}
