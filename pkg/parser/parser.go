package parser

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
	"varmanager/pkg/models"

	"golang.org/x/text/encoding/japanese"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
)

// Helper to decode bytes to UTF-8
func decodeBytes(data []byte) []byte {
	if utf8.Valid(data) {
		return data
	}

	// Try ShiftJIS (Common for Japanese)
	r := transform.NewReader(bytes.NewReader(data), japanese.ShiftJIS.NewDecoder())
	if decoded, err := io.ReadAll(r); err == nil {
		return decoded
	}

	// Try GBK (Common for Chinese)
	r = transform.NewReader(bytes.NewReader(data), simplifiedchinese.GBK.NewDecoder())
	if decoded, err := io.ReadAll(r); err == nil {
		return decoded
	}

	// Fallback to sanitizing invalid UTF-8
	return []byte(strings.ToValidUTF8(string(data), "?"))
}

// ParseVarMetadata reads the meta.json file from a .var package (zip archive) and detects categories
func ParseVarMetadata(filePath string) (models.MetaJSON, []byte, []string, error) {
	var meta models.MetaJSON
	var thumbBytes []byte
	categorySet := make(map[string]bool)

	r, err := zip.OpenReader(filePath)
	if err != nil {
		// Enhanced debugging for user feedback
		info, sErr := os.Stat(filePath)
		if sErr != nil {
			fmt.Printf("Error accessing file %s: %v\n", filePath, sErr)
		} else {
			fmt.Printf("Error opening zip %s (Size: %d): %v\n", filePath, info.Size(), err)
		}
		return meta, nil, nil, err
	}
	defer r.Close()

	var candidate *zip.File
	candidatePriority := 0

	var fallbackCandidate *zip.File
	fallbackPriority := 0

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
			parts := strings.Split(normName, "/")
			if len(parts) > 2 {
				cat := parts[1]
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
					// Decode encoding if necessary
					decoded := decodeBytes(bytes)
					_ = json.Unmarshal(decoded, &meta)
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
					decoded := decodeBytes(bytes)
					var item VamItem
					if err := json.Unmarshal(decoded, &item); err == nil {
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

		// Thumbnail Candidate Logic
		if candidatePriority < 3 {
			ext := filepath.Ext(normName)

			// --- Fallback Logic: Capture any potential image ---
			if ext == ".jpg" || ext == ".png" {
				// Ignore textures and assets folders to avoid noise (too many small images)
				if !strings.Contains(normName, "/textures/") && !strings.Contains(normName, "/assets/") {
					prio := 1
					// If it's in a known content category folder, bump priority
					if strings.Contains(normName, "saves/scene") {
						prio = 2
					} else if strings.Contains(normName, "saves/person") {
						prio = 2
					} else if strings.Contains(normName, "custom/clothing") {
						prio = 2
					} else if strings.Contains(normName, "custom/hair") {
						prio = 2
					}

					if prio > fallbackPriority {
						fallbackCandidate = f
						fallbackPriority = prio
					} else if prio == fallbackPriority {
						// Tie-breaker: Prefer larger files (likely higher quality preview)
						if fallbackCandidate == nil || f.FileInfo().Size() > fallbackCandidate.FileInfo().Size() {
							fallbackCandidate = f
						}
					}
				}
			}
			// ---------------------------------------------------

			if isContent {
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

	// Use Fallback if no specific candidate found
	if candidate == nil && fallbackCandidate != nil {
		candidate = fallbackCandidate
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

	return meta, thumbBytes, categories, nil
}
