package parser

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"varmanager/pkg/models"
)

// ParseVarMetadata reads the meta.json file from a .var package (zip archive) and detects categories
func ParseVarMetadata(filePath string) (models.MetaJSON, []byte, []string, error) {
	var meta models.MetaJSON
	var thumbBytes []byte
	categorySet := make(map[string]bool)

	r, err := zip.OpenReader(filePath)
	if err != nil {
		fmt.Printf("Error opening zip %s: %v\n", filePath, err)
		return meta, nil, nil, err
	}
	defer r.Close()

	var candidate *zip.File
	candidatePriority := 0

	// Helper for parsing .vam files
	type VamItem struct {
		Tags string `json:"tags"`
	}
	tagSet := make(map[string]bool)

	// 1. Index files for fast lookup
	fileMap := make(map[string]*zip.File)
	for _, f := range r.File {
		if !f.FileInfo().IsDir() {
			fileMap[strings.ToLower(strings.ReplaceAll(f.Name, "\\", "/"))] = f
		}
	}

	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}

		normName := strings.ReplaceAll(strings.ToLower(f.Name), "\\", "/")
		isContent := false

		// Category Detection & Content Identification
		if strings.HasPrefix(normName, "saves/scene/") && strings.HasSuffix(normName, ".json") {
			categorySet["Scene"] = true
			isContent = true
		} else if strings.HasPrefix(normName, "saves/person/appearance/") && strings.HasSuffix(normName, ".vap") {
			categorySet["Look"] = true
			isContent = true
		} else if strings.HasPrefix(normName, "custom/clothing/") {
			categorySet["Clothing"] = true
			// Clothing items often don't have a single file representing the item (folder based),
			// but if there is a .vam or .json, we might check for image.
			// Check suffixes commonly associated with definitions
			if strings.HasSuffix(normName, ".vam") || strings.HasSuffix(normName, ".json") {
				isContent = true
			}
		} else if strings.HasPrefix(normName, "custom/hair/") {
			categorySet["Hair"] = true
			if strings.HasSuffix(normName, ".vam") || strings.HasSuffix(normName, ".json") {
				isContent = true
			}
		} else if strings.HasPrefix(normName, "custom/atom/person/morphs/") {
			categorySet["Morph"] = true
			if strings.HasSuffix(normName, ".vmi") || strings.HasSuffix(normName, ".vmb") {
				isContent = true
			}
		} else if strings.HasPrefix(normName, "custom/atom/person/textures/") {
			categorySet["Skin"] = true
			// Textures themselves are content, but usually don't have "thumbnails" separate from themselves?
			// Actually User wants to AVOID textures.
			// So we set isContent=false here strictly for thumbnail purposes
			isContent = false
		} else if strings.HasPrefix(normName, "custom/scripts/") {
			categorySet["Script"] = true
			if strings.HasSuffix(normName, ".cs") || strings.HasSuffix(normName, ".cslist") {
				isContent = true
			}
		} else if strings.HasPrefix(normName, "custom/assets/") {
			categorySet["Asset"] = true
			if strings.HasSuffix(normName, ".assetbundle") || strings.HasSuffix(normName, ".scene") {
				isContent = true
			}
		} else if strings.HasPrefix(normName, "custom/") {
			// Generic dynamic category detection (Custom/CategoryName/...)
			parts := strings.Split(normName, "/")
			if len(parts) > 2 {
				// parts[0] is "custom", parts[1] is the category
				cat := parts[1]
				// Capitalize first letter
				if len(cat) > 0 {
					cat = strings.ToUpper(cat[:1]) + cat[1:]
					categorySet[cat] = true
				}
			}
		}

		// Metadata Parsing
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

		// Deep Tag Scanning
		if strings.HasSuffix(normName, ".vam") {
			rc, err := f.Open()
			if err == nil {
				bytes, err := io.ReadAll(rc)
				rc.Close()
				if err == nil {
					var item VamItem
					if err := json.Unmarshal(bytes, &item); err == nil {
						if item.Tags != "" {
							parts := strings.Split(item.Tags, ",")
							for _, p := range parts {
								t := strings.TrimSpace(p)
								if t != "" {
									tagSet[t] = true
								}
							}
						}
					}
				}
			}
		}

		// Thumbnail Candidate Logic: Content Sibling (Priority 3)
		// If we haven't found a higher priority candidate yet...
		if candidatePriority < 3 && isContent {
			// Look for sibling jpg/png
			// Remove extension
			ext := filepath.Ext(normName)
			base := normName[:len(normName)-len(ext)]

			if img, ok := fileMap[base+".jpg"]; ok {
				candidate = img
				candidatePriority = 3
			} else if img, ok := fileMap[base+".png"]; ok {
				candidate = img
				candidatePriority = 3
			}
		}
	}

	// Priority 4: Standard Package Image
	if f, ok := fileMap["package.jpg"]; ok {
		candidate = f
		candidatePriority = 4
	} else if f, ok := fileMap["package.png"]; ok {
		candidate = f
		candidatePriority = 4
	}

	// Priority 5: Meta ImageUrl (Highest)
	if meta.ImageUrl != "" {
		target := strings.ReplaceAll(strings.ToLower(meta.ImageUrl), "\\", "/")
		if f, ok := fileMap[target]; ok {
			candidate = f
			candidatePriority = 5
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

	// Aggregate tags
	for t := range tagSet {
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

	// Convert categories set to slice
	var categories []string
	for c := range categorySet {
		categories = append(categories, c)
	}

	// Sort by priority (Scene/Look/Clothing/Hair) then alphabetical
	// This helps with "Primary Type" determination (first element)
	// We handle this via custom sort
	/* 	sort.Slice(categories, func(i, j int) bool {
		// Define priority
		prio := func(s string) int {
			switch s {
			case "Scene": return 0
			case "Look": return 1
			case "Clothing": return 2
			case "Hair": return 3
			case "Morph": return 4
			case "Skin": return 5
			default: return 10
			}
		}
		pi, pj := prio(categories[i]), prio(categories[j])
		if pi != pj {
			return pi < pj
		}
		return categories[i] < categories[j]
	}) */
	// Simple sort for now, Manager/UI can handle display priority
	// But good to have deterministic order
	// sort.Strings(categories) --> done in manager if needed, but parser should return stable

	return meta, thumbBytes, categories, nil
}
