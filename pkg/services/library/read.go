package library

import (
	"archive/zip"
	"encoding/base64"
	"fmt"
	"io"
	"path/filepath"
	"sort"
	"strings"
	"varmanager/pkg/models"
)

// GetPackageContents scans a .var file and returns a list of its displayable contents
func (s *defaultLibraryService) GetPackageContents(pkgPath string) ([]models.PackageContent, error) {
	r, err := zip.OpenReader(pkgPath)
	if err != nil {
		return nil, err
	}
	defer r.Close()

	var contents []models.PackageContent
	// Map to store thumbnails found to match them later
	// key: generic path without extension, value: *zip.File
	thumbnails := make(map[string]*zip.File)

	// First pass: Index files and find potential content
	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}

		lowerName := strings.ToLower(f.Name) // internal zip paths are usually forward slashes

		// Index thumbnails
		if strings.HasSuffix(lowerName, ".jpg") || strings.HasSuffix(lowerName, ".png") {
			noExt := strings.TrimSuffix(lowerName, filepath.Ext(lowerName))
			thumbnails[noExt] = f
		}
	}

	// Second pass: Identify Content
	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}

		lowerName := strings.ToLower(f.Name)
		contentType := ""

		// Scenes
		if strings.Contains(lowerName, "saves/scene/") && strings.HasSuffix(lowerName, ".json") {
			contentType = "Scene"
		} else if strings.Contains(lowerName, "saves/person/appearance/") && strings.HasSuffix(lowerName, ".vap") {
			contentType = "Look"
		} else if strings.Contains(lowerName, "custom/clothing/") && strings.HasSuffix(lowerName, ".vap") {
			contentType = "Clothing"
		} else if strings.Contains(lowerName, "custom/hair/") && strings.HasSuffix(lowerName, ".vap") {
			contentType = "Hair"
		} else if strings.Contains(lowerName, "custom/atom/person/morphs/") && (strings.HasSuffix(lowerName, ".vmi") || strings.HasSuffix(lowerName, ".vmb")) {
			contentType = "Morph"
		} else if strings.Contains(lowerName, "custom/assets/") && strings.HasSuffix(lowerName, ".assetbundle") {
			// Only show asset bundles, not every texture
			contentType = "Asset"
		} else if strings.Contains(lowerName, "custom/") && strings.HasSuffix(lowerName, ".vap") {
			// Generic VAP in custom folder (Shoes, etc)
			// Try to infer type from folder name
			parts := strings.Split(lowerName, "/")
			for i, p := range parts {
				if p == "custom" && i+1 < len(parts) {
					cat := parts[i+1]
					if cat != "clothing" && cat != "hair" && cat != "assets" && cat != "atom" {
						contentType = titleCase(cat)
					}
					break
				}
			}
			if contentType == "" {
				contentType = "Preset"
			}
		}

		if contentType != "" {
			pc := models.PackageContent{
				FilePath: f.Name,
				FileName: filepath.Base(f.Name),
				Type:     contentType,
				Size:     f.FileInfo().Size(),
			}

			// Look for matching thumbnail
			noExt := strings.TrimSuffix(lowerName, filepath.Ext(lowerName))
			if thumbFile, ok := thumbnails[noExt]; ok {
				rc, err := thumbFile.Open()
				if err == nil {
					data, err := io.ReadAll(rc)
					rc.Close()
					if err == nil {
						pc.ThumbnailBase64 = base64.StdEncoding.EncodeToString(data)
					}
				}
			}

			contents = append(contents, pc)
		}
	}

	// Sort contents: Scenes first, then Looks, then others
	sort.Slice(contents, func(i, j int) bool {
		order := map[string]int{"Scene": 0, "Look": 1, "Clothing": 2, "Hair": 3, "Morph": 4, "Skin": 5, "Preset": 6, "Script": 7, "Asset": 8}

		t1 := order[contents[i].Type]
		if t1 == 0 && contents[i].Type != "Scene" {
			t1 = 50
		}

		t2 := order[contents[j].Type]
		if t2 == 0 && contents[j].Type != "Scene" {
			t2 = 50
		}

		if t1 != t2 {
			return t1 < t2
		}
		return contents[i].FileName < contents[j].FileName
	})

	return contents, nil
}

func (s *defaultLibraryService) GetThumbnail(pkgPath string) ([]byte, error) {
	// Not implemented in Manager originally?
	// It was embedded in `ScanAndAnalyze` or `GetPackageContents`.
	// For API, we might want it separate.
	// Implementing basic extraction of "thumb.jpg" or similar if needed.
	// For now, returning error/empty conforming to interface.
	return nil, fmt.Errorf("not implemented")
}

func (s *defaultLibraryService) GetCounts(libraries []string) map[string]int {
	results := make(map[string]int)

	// This was concurrent in manager
	// We can keep it concurrent or simple sequential since it's just calling scanner.CountPackages
	for _, lib := range libraries {
		c, _ := s.scanner.CountPackages(lib)
		results[lib] = c
	}
	return results
}

func titleCase(s string) string {
	if len(s) == 0 {
		return ""
	}
	return strings.ToUpper(s[:1]) + strings.ToLower(s[1:])
}
