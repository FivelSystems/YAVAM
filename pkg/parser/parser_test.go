package parser

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
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

	// Test 5: User Report Reproduction (Look vs Clothing Texture)
	// LipRing (Clothing folder, .vab sibling) vs Yasmin (Appearance folder, .vap sibling)
	runTest("User Look vs Clothing", map[string]string{
		"meta.json": "{}",
		"Custom/Clothing/Female/Jackaroo/LipRing/LipRing.png": "lipring_texture",
		"Custom/Clothing/Female/Jackaroo/LipRing/LipRing.vab": "{}",
		"Custom/Atom/Person/Appearance/Preset_Yasmin.jpg":     "yasmin_thumb",
		"Custom/Atom/Person/Appearance/Preset_Yasmin.vap":     "{}",
	}, "yasmin_thumb")
	// Test 6: Alphabetical Tie-Breaker (Small A vs Large B)
	// Both are Scenes (Priority 4). A is alphabetically first, but B is larger.
	// Previous Logic: B wins (Size).
	// New Logic: A wins (Alphabetical).
	runTest("Alphabetical vs Size", map[string]string{
		"meta.json":                "{}",
		"Saves/scene/A_Scene.json": "{}",
		"Saves/scene/A_Scene.jpg":  "a_thumb", // First alphabetically
		"Saves/scene/B_Scene.json": "{}",
		"Saves/scene/B_Scene.jpg":  strings.Repeat("b", 1000), // Larger file (1000 bytes vs ~7 bytes)
	}, "a_thumb")

	// Test 7: Case Sensitive Tie-Breaker (Z vs a)
	// Go Sort: 'Z' (90) < 'a' (97). Comparison should be Case Sensitive.
	runTest("Case Sensitive", map[string]string{
		"meta.json":                "{}",
		"Saves/scene/Z_Scene.json": "{}",
		"Saves/scene/Z_Scene.jpg":  "z_thumb",
		"Saves/scene/a_scene.json": "{}",
		"Saves/scene/a_scene.jpg":  "a_thumb",
	}, "z_thumb")
}

// TestLicenseTypeParsing verifies that licenseType is read from meta.json
// at zero extra I/O cost (the zip is already open during the Hard Pass).
func TestLicenseTypeParsing(t *testing.T) {
	cases := []struct {
		name        string
		metaJSON    string
		wantLicense string
	}{
		{
			name:        "CC BY",
			metaJSON:    `{"creator":"A","packageName":"B","version":"1","licenseType":"CC BY"}`,
			wantLicense: "CC BY",
		},
		{
			name:        "PC",
			metaJSON:    `{"creator":"A","packageName":"B","version":"1","licenseType":"PC"}`,
			wantLicense: "PC",
		},
		{
			name:        "PC EA",
			metaJSON:    `{"creator":"A","packageName":"B","version":"1","licenseType":"PC EA"}`,
			wantLicense: "PC EA",
		},
		{
			name:        "missing licenseType",
			metaJSON:    `{"creator":"A","packageName":"B","version":"1"}`,
			wantLicense: "",
		},
		{
			name:        "empty licenseType",
			metaJSON:    `{"creator":"A","packageName":"B","version":"1","licenseType":""}`,
			wantLicense: "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Build a minimal .var zip in a temp file.
			tmpFile := filepath.Join(t.TempDir(), "test.var")
			buf := new(bytes.Buffer)
			w := zip.NewWriter(buf)
			f, _ := w.Create("meta.json")
			f.Write([]byte(tc.metaJSON))
			w.Close()

			if err := os.WriteFile(tmpFile, buf.Bytes(), 0644); err != nil {
				t.Fatalf("write temp var: %v", err)
			}

			meta, _, _, err := ParseVarMetadata(tmpFile)
			if err != nil {
				t.Fatalf("ParseVarMetadata: %v", err)
			}

			if meta.LicenseType != tc.wantLicense {
				t.Errorf("LicenseType = %q, want %q", meta.LicenseType, tc.wantLicense)
			}
		})
	}
}

func TestParseVarMetadataWithOptionsSkipsThumbnailOnly(t *testing.T) {
	buf := new(bytes.Buffer)
	w := zip.NewWriter(buf)
	for name, content := range map[string]string{
		"meta.json":                `{"creatorName":"c","packageName":"p","tags":"a,b"}`,
		"package.jpg":              "root_thumb",
		"Saves/scene/MyScene.json": "{}",
		"Custom/Clothing/Item.vam": `{"tags":"extra"}`,
	} {
		f, err := w.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		f.Write([]byte(content))
	}
	w.Close()
	path := filepath.Join(t.TempDir(), "test.var")
	if err := os.WriteFile(path, buf.Bytes(), 0644); err != nil {
		t.Fatal(err)
	}

	fullMeta, fullThumb, fullCats, err := ParseVarMetadataWithOptions(path, ParseOptions{ExtractThumbnail: true})
	if err != nil {
		t.Fatal(err)
	}
	skipMeta, skipThumb, skipCats, err := ParseVarMetadataWithOptions(path, ParseOptions{ExtractThumbnail: false})
	if err != nil {
		t.Fatal(err)
	}

	if string(fullThumb) != "root_thumb" {
		t.Fatalf("extracting call returned thumbnail %q", fullThumb)
	}
	if len(skipThumb) != 0 {
		t.Errorf("skipping call returned %d thumbnail bytes", len(skipThumb))
	}
	if !reflect.DeepEqual(fullMeta, skipMeta) {
		t.Errorf("metadata differs: %+v vs %+v", fullMeta, skipMeta)
	}
	sort.Strings(fullCats)
	sort.Strings(skipCats)
	if !reflect.DeepEqual(fullCats, skipCats) || len(fullCats) == 0 {
		t.Errorf("categories differ or empty: %v vs %v", fullCats, skipCats)
	}
}

func BenchmarkParseVarMetadataThumbnail(b *testing.B) {
	buf := new(bytes.Buffer)
	w := zip.NewWriter(buf)
	f, _ := w.Create("meta.json")
	f.Write([]byte("{}"))
	f, _ = w.Create("package.jpg")
	f.Write(bytes.Repeat([]byte("x"), 4*1024*1024))
	w.Close()
	path := filepath.Join(b.TempDir(), "bench.var")
	if err := os.WriteFile(path, buf.Bytes(), 0644); err != nil {
		b.Fatal(err)
	}

	for _, extract := range []bool{true, false} {
		b.Run(map[bool]string{true: "extract", false: "skip"}[extract], func(b *testing.B) {
			for i := 0; i < b.N; i++ {
				if _, _, _, err := ParseVarMetadataWithOptions(path, ParseOptions{ExtractThumbnail: extract}); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}
