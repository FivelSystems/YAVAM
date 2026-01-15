package parser

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestThumbnailPriority(t *testing.T) {
	// Helper to create a zip buffer with specific files
	createZip := func(files map[string]string) *bytes.Buffer {
		buf := new(bytes.Buffer)
		w := zip.NewWriter(buf)
		for name, content := range files {
			f, _ := w.Create(name)
			f.Write([]byte(content))
		}
		w.Close()
		return buf
	}

	runTest := func(name string, files map[string]string, expectedContent string) {
		t.Run(name, func(t *testing.T) {
			zipBuf := createZip(files)

			// content of zipBuf to temp file
			tmpFile := filepath.Join(t.TempDir(), "test.var")
			if err := os.WriteFile(tmpFile, zipBuf.Bytes(), 0644); err != nil {
				t.Fatal(err)
			}

			_, thumbBytes, _, err := ParseVarMetadata(tmpFile)
			if err != nil {
				t.Fatalf("Parse failed: %v", err)
			}

			if string(thumbBytes) != expectedContent {
				t.Errorf("Expected thumbnail '%s', got '%s'", expectedContent, string(thumbBytes))
			}
		})
	}

	// Test 1: Root vs Scene (Root Prio 5 > Scene Prio 4)
	runTest("Root vs Scene", map[string]string{
		"meta.json":                "{}",
		"package.jpg":              "root_thumb",
		"Saves/scene/MyScene.json": "{}",
		"Saves/scene/MyScene.jpg":  "scene_thumb",
	}, "root_thumb")

	// Test 2: Scene vs Preset (Scene Prio 4 > Preset Prio 3)
	runTest("Scene vs Preset", map[string]string{
		"meta.json":                "{}",
		"Saves/scene/MyScene.json": "{}",
		"Saves/scene/MyScene.jpg":  "scene_thumb",
		"Custom/Clothing/Item.vap": "{}",
		"Custom/Clothing/Item.jpg": "preset_thumb",
	}, "scene_thumb")

	// Test 3: Preset vs Fallback (Preset Prio 3 > Fallback Prio 2)
	runTest("Preset vs Fallback", map[string]string{
		"meta.json":                 "{}",
		"Custom/Clothing/Item.vap":  "{}",
		"Custom/Clothing/Item.jpg":  "preset_thumb",
		"Custom/Clothing/Other.jpg": "fallback_thumb",
	}, "preset_thumb")

	// Test 4: Meta Image vs Root (Meta Prio 6 > Root Prio 5)
	runTest("Meta vs Root", map[string]string{
		"meta.json":          `{"imageUrl": "Custom/Preview.jpg"}`,
		"Custom/Preview.jpg": "meta_thumb",
		"package.jpg":        "root_thumb",
	}, "meta_thumb")
}
