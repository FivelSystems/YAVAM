package parser

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"varmanager/pkg/models"
)

// ParseVarMetadata reads the meta.json file from a .var package (zip archive) and detects content type
func ParseVarMetadata(filePath string) (models.MetaJSON, []byte, string, error) {
	var meta models.MetaJSON
	var thumbBytes []byte
	contentType := "Unknown"

	r, err := zip.OpenReader(filePath)
	if err != nil {
		fmt.Printf("Error opening zip %s: %v\n", filePath, err)
		return meta, nil, contentType, err
	}
	defer r.Close()

	var candidate *zip.File
	candidatePriority := 0

	// Content Type Detection Flags
	hasScene := false
	hasClothing := false
	hasHair := false
	hasMorph := false
	hasSkin := false
	hasAsset := false
	hasScript := false
	hasLook := false

	// Helper for parsing .vam files
	type VamItem struct {
		Tags string `json:"tags"`
	}
	tagSet := make(map[string]bool)

	for _, f := range r.File {
		normName := strings.ReplaceAll(strings.ToLower(f.Name), "\\", "/")

		// Type Detection
		if strings.HasPrefix(normName, "saves/scene/") && strings.HasSuffix(normName, ".json") {
			hasScene = true
		}
		if strings.HasPrefix(normName, "custom/clothing/") {
			hasClothing = true
		}
		if strings.HasPrefix(normName, "custom/hair/") {
			hasHair = true
		}
		if strings.HasPrefix(normName, "custom/atom/person/morphs/") {
			hasMorph = true
		}
		if strings.HasPrefix(normName, "custom/atom/person/textures/") {
			hasSkin = true
		}
		if strings.HasPrefix(normName, "custom/assets/") {
			hasAsset = true
		}
		if strings.HasPrefix(normName, "custom/scripts/") {
			hasScript = true
		}
		if strings.HasPrefix(normName, "saves/person/appearance/") && strings.HasSuffix(normName, ".vap") {
			hasLook = true
		}

		// 1. Metadata Parsing
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

		// 2. Deep Tag Scanning (VAM files)
		if strings.HasSuffix(normName, ".vam") {
			rc, err := f.Open()
			if err == nil {
				bytes, err := io.ReadAll(rc)
				rc.Close()
				if err == nil {
					var item VamItem
					if err := json.Unmarshal(bytes, &item); err == nil {
						if item.Tags != "" {
							fmt.Printf("DEBUG PARSER: Found Tags in %s: %s\n", f.Name, item.Tags)
							parts := strings.Split(item.Tags, ",")
							for _, p := range parts {
								t := strings.TrimSpace(p)
								if t != "" {
									tagSet[t] = true
								}
							}
						} else {
							fmt.Printf("DEBUG PARSER: Found .vam %s but NO tags.\n", f.Name)
						}
					} else {
						fmt.Printf("DEBUG PARSER: Failed to unmarshal .vam %s: %v\n", f.Name, err)
					}
				}
			} else {
				fmt.Printf("DEBUG PARSER: Failed to open .vam %s: %v\n", f.Name, err)
			}
		}

		// 3. Thumbnail Hunting
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
			}
		}
	}

	// Logic to finalize contentType
	if hasScene {
		contentType = "Scene"
	} else if hasLook {
		contentType = "Look"
	} else if hasClothing {
		contentType = "Clothing"
	} else if hasHair {
		contentType = "Hair"
	} else if hasScript {
		contentType = "Script"
	} else if hasAsset {
		contentType = "Asset"
	} else if hasMorph {
		contentType = "Morph"
	} else if hasSkin {
		contentType = "Skin"
	}

	// Aggregate tags
	for t := range tagSet {
		// Avoid duplicates if meta.Tags somehow already had them (unlikely for meta.json but good practice)
		found := false
		for _, existing := range meta.Tags {
			if existing == t {
				found = true
				break
			}
		}
		if !found {
			meta.Tags = append(meta.Tags, t)
		}
	}

	return meta, thumbBytes, contentType, nil
}
