package parser

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
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

	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}

		normName := strings.ReplaceAll(strings.ToLower(f.Name), "\\", "/")

		// Category Detection
		if strings.HasPrefix(normName, "saves/scene/") && strings.HasSuffix(normName, ".json") {
			categorySet["Scene"] = true
		} else if strings.HasPrefix(normName, "saves/person/appearance/") && strings.HasSuffix(normName, ".vap") {
			categorySet["Look"] = true
		} else if strings.HasPrefix(normName, "custom/clothing/") {
			categorySet["Clothing"] = true
		} else if strings.HasPrefix(normName, "custom/hair/") {
			categorySet["Hair"] = true
		} else if strings.HasPrefix(normName, "custom/atom/person/morphs/") {
			categorySet["Morph"] = true
		} else if strings.HasPrefix(normName, "custom/atom/person/textures/") {
			categorySet["Skin"] = true
		} else if strings.HasPrefix(normName, "custom/scripts/") {
			categorySet["Script"] = true
		} else if strings.HasPrefix(normName, "custom/assets/") {
			categorySet["Asset"] = true
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

		// 3. Thumbnail Hunting
		if !strings.HasSuffix(normName, ".jpg") && !strings.HasSuffix(normName, ".png") {
			continue
		}

		currentPriority := 0
		if normName == "package.jpg" || normName == "package.png" {
			currentPriority = 5
		} else if strings.Contains(normName, "saves/scene/") && !strings.Contains(normName, "/screenshots/") {
			currentPriority = 3
		} else if strings.Contains(normName, "/appearance/") || strings.Contains(normName, "/clothing/") {
			currentPriority = 2
		} else {
			// STRICTER FILTERING: Ignore random textures
			if strings.Contains(normName, "/textures/") || strings.Contains(normName, "/texture/") {
				continue
			}
			if strings.Contains(normName, "_nm.") || strings.Contains(normName, "_spec.") || strings.Contains(normName, "_trans.") {
				continue
			}
			if strings.HasPrefix(normName, "custom/") {
				// Ignore custom assets/textures unless strictly matched above
				continue
			}
			currentPriority = 1
		}

		if currentPriority > candidatePriority {
			candidate = f
			candidatePriority = currentPriority
		}
	}

	// Override: If meta specifies an image, use it!
	if meta.ImageUrl != "" {
		target := strings.ReplaceAll(strings.ToLower(meta.ImageUrl), "\\", "/")
		for _, f := range r.File {
			fn := strings.ReplaceAll(strings.ToLower(f.Name), "\\", "/")
			if fn == target {
				candidate = f
				break
			}
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
