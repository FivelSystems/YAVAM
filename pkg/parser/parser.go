package parser

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"varmanager/pkg/models"
)

// ParseVarMetadata reads the meta.json file from a .var package (zip archive)
func ParseVarMetadata(filePath string) (models.MetaJSON, []byte, error) {
	var meta models.MetaJSON
	var thumbBytes []byte

	r, err := zip.OpenReader(filePath)
	if err != nil {
		fmt.Printf("Error opening zip %s: %v\n", filePath, err)
		return meta, nil, err
	}
	defer r.Close()

	var candidate *zip.File
	candidatePriority := 0 // 0=None, 1=Generic, 2=Preset, 3=Scene, 4=Package

	for _, f := range r.File {
		// Normalize path
		normName := strings.ReplaceAll(strings.ToLower(f.Name), "\\", "/")

		// 1. Metadata Parsing (Keep checking this regardless of thumbs)
		if normName == "meta.json" || normName == "core/meta.json" {
			rc, err := f.Open()
			if err == nil {
				bytes, err := io.ReadAll(rc)
				rc.Close()
				if err == nil {
					_ = json.Unmarshal(bytes, &meta)
				}
			}
		}

		// 2. Thumbnail Hunting
		// We only care about images
		if !strings.HasSuffix(normName, ".jpg") && !strings.HasSuffix(normName, ".png") {
			continue
		}

		currentPriority := 0

		// Priority 4: Standard Root Image (The Gold Standard)
		if normName == "package.jpg" || normName == "package.png" {
			currentPriority = 4
		} else if strings.HasPrefix(normName, "saves/scene/") && !strings.Contains(normName, "/screenshots/") {
			// Priority 3: Scene Thumbnails (High likelyhood of being the intended cover)
			currentPriority = 3
		} else if strings.Contains(normName, "/appearance/") || strings.Contains(normName, "/clothing/") {
			// Priority 2: Preset/Clothing Thumbnails
			currentPriority = 2
		} else {
			// Priority 1: Generic Fallback
			// Filter out obvious textures/maps to avoid garbage
			if strings.Contains(normName, "/textures/") || strings.Contains(normName, "/texture/") {
				continue
			}
			// Filter out common map suffixes
			if strings.Contains(normName, "_nm.") || strings.Contains(normName, "_spec.") || strings.Contains(normName, "_bump.") || strings.Contains(normName, "_gloss.") || strings.Contains(normName, "_trans.") {
				continue
			}
			currentPriority = 1
		}

		// Update candidate if this one is better OR equal (preferring first found? or last? First is usually fine)
		if currentPriority > candidatePriority {
			candidate = f
			candidatePriority = currentPriority
		}
	}

	// Extract candidate if found
	if candidate != nil {
		rc, err := candidate.Open()
		if err == nil {
			data, err := io.ReadAll(rc)
			rc.Close()
			if err == nil {
				thumbBytes = data
				// fmt.Printf("DEBUG: Found thumbnail [P%d] %s for %s\n", candidatePriority, candidate.Name, filepath.Base(filePath))
			}
		}
	}

	return meta, thumbBytes, nil
}
