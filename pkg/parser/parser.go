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
	"yavam/pkg/models"

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

	// Helper for parsing .vam files
	type VamItem struct {
		Tags string `json:"tags"`
	}
	tagSet := make(map[string]bool)

	// 1. Index files for fast lookup
	fileMap := make(map[string]*zip.File)
	contentPriority := make(map[string]int) // filePath -> priority (4=High, 3=Med, 2=Low)

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

		// Category Detection & Content Priority Assignment
		if strings.HasPrefix(normName, "saves/scene/") && strings.HasSuffix(normName, ".json") {
			categorySet["Scene"] = true
			contentPriority[normName] = 4 // Highest
		} else if (strings.HasPrefix(normName, "saves/person/appearance/") || strings.HasPrefix(normName, "custom/atom/person/appearance/")) && strings.HasSuffix(normName, ".vap") {
			categorySet["Look"] = true
			contentPriority[normName] = 4 // High (Look matches Scene)
		} else if strings.HasPrefix(normName, "custom/clothing/") {
			categorySet["Clothing"] = true
			if strings.HasSuffix(normName, ".vam") || strings.HasSuffix(normName, ".json") || strings.HasSuffix(normName, ".vap") {
				contentPriority[normName] = 3
			}
		} else if strings.HasPrefix(normName, "custom/hair/") {
			categorySet["Hair"] = true
			if strings.HasSuffix(normName, ".vam") || strings.HasSuffix(normName, ".json") || strings.HasSuffix(normName, ".vap") {
				contentPriority[normName] = 3
			}
		} else if strings.HasPrefix(normName, "custom/atom/person/morphs/") {
			categorySet["Morph"] = true
			if strings.HasSuffix(normName, ".vmi") || strings.HasSuffix(normName, ".vmb") {
				contentPriority[normName] = 2
			}
		} else if strings.HasPrefix(normName, "custom/atom/person/textures/") {
			categorySet["Skin"] = true
			// Textures are NOT content (Prio 0)
		} else if strings.HasPrefix(normName, "custom/scripts/") {
			categorySet["Script"] = true
			if strings.HasSuffix(normName, ".cs") || strings.HasSuffix(normName, ".cslist") {
				contentPriority[normName] = 2
			}
		} else if strings.HasPrefix(normName, "custom/assets/") {
			categorySet["Asset"] = true
			if strings.HasSuffix(normName, ".assetbundle") || strings.HasSuffix(normName, ".scene") {
				contentPriority[normName] = 2
			}
		} else if strings.HasPrefix(normName, "custom/") {
			parts := strings.Split(normName, "/")
			if len(parts) > 2 {
				cat := parts[1]
				if len(cat) > 0 {
					cat = strings.ToUpper(cat[:1]) + cat[1:]
					categorySet[cat] = true
					// Unknown custom category content?
					// Be conservative: Prio 0 unless we add generic detection
				}
			}
		}

		// Metadata Parsing
		if normName == "meta.json" || normName == "core/meta.json" {
			rc, err := f.Open()
			if err == nil {
				// Limit meta.json/meta.json to 5MB
				bytes, err := io.ReadAll(io.LimitReader(rc, 5*1024*1024))
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
				// Limit .vam files to 5MB
				bytes, err := io.ReadAll(io.LimitReader(rc, 5*1024*1024))
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
	}

	// 2. Build Set of "Potential Content Basenames" (Files that are NOT images)
	// 2. Thumbnail Detection Strategy (Sibling File Rule - Unified)
	// Logic: An image is a valid thumbnail if its sibling is VALID CONTENT.
	// We rely on contentPriority map populated above.
	contentBasenames := make(map[string]string) // base -> full path of sibling
	for name := range fileMap {
		ext := filepath.Ext(name)
		if ext == ".jpg" || ext == ".png" || ext == "" {
			continue // Skip images
		}
		// Only consider files that are MARKED as Content
		if _, isContent := contentPriority[name]; isContent {
			base := name[:len(name)-len(ext)]
			// Store the Highest Priority sibling if multiple exist?
			// The map is base -> path.
			// Check if we already have a sibling for this base.
			if existing, ok := contentBasenames[base]; ok {
				if contentPriority[name] > contentPriority[existing] {
					contentBasenames[base] = name
				}
			} else {
				contentBasenames[base] = name
			}
		}
	}

	// 3. Scan Images
	for name, f := range fileMap {
		ext := filepath.Ext(name)
		if ext != ".jpg" && ext != ".png" {
			continue
		}

		base := name[:len(name)-len(ext)]
		siblingPath, hasSibling := contentBasenames[base]

		// Texture/Asset Filter:
		// Ignore images in textures/assets folders UNLESS they have a Strong Sibling (content).
		// This prevents large texture files from winning the "Fallback Candidate" (Prio 0) race.
		isTextureOrAsset := strings.Contains(name, "/textures/") || strings.Contains(name, "/assets/")
		if isTextureOrAsset && !hasSibling {
			continue
		}

		prio := 0
		if hasSibling {
			// Found a validated content sibling! Use its priority.
			prio = contentPriority[siblingPath]

			// Tie-breaker boost for Look/Scene to ensure they beat Clothes?
			// Already handled by assigning 4 to Look/Scene and 3 to Clothing.
		} else {
			// No Content Sibling.
			// Do we want Fallback logic?
			// Prior code had: "Fallback if in saves/scene or saves/person".
			if strings.Contains(name, "saves/scene") || strings.Contains(name, "saves/person") {
				prio = 1
			}
		}

		// Update Candidate
		if prio > candidatePriority {
			candidate = f
			candidatePriority = prio
		} else if prio == candidatePriority && prio > 0 {
			// Tie-breaker: Larger size
			if candidate == nil || f.FileInfo().Size() > candidate.FileInfo().Size() {
				candidate = f
			}
		}

		// Retain Fallback (Prio 0/1 equivalent from before) in case nothing matches
		if !hasSibling && (candidatePriority == 0) {
			// Heuristic: If we are completely desperate, pick the largest image in the zip?
			// Or maintain the "FallbackCandidate" separate logic?
			// Let's rely on the loops above. Prio 1 captures "Orphan in Scene Folder".
			// If Prio is still 0, we can pick ANY image as last resort?
			// The original code did `fallbackCandidate`.
			if fallbackCandidate == nil || f.FileInfo().Size() > fallbackCandidate.FileInfo().Size() {
				fallbackCandidate = f
			}
		}
	}

	// Priority 5: Standard Package Image
	if candidatePriority < 5 {
		if f, ok := fileMap["package.jpg"]; ok {
			candidate = f
			candidatePriority = 5
		} else if f, ok := fileMap["package.png"]; ok {
			candidate = f
			candidatePriority = 5
		}
	}

	// Priority 6: Meta ImageUrl (Highest)
	if meta.ImageUrl != "" {
		target := strings.ReplaceAll(strings.ToLower(meta.ImageUrl), "\\", "/")
		if f, ok := fileMap[target]; ok {
			candidate = f
			candidatePriority = 6
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
			// Limit thumbnail extraction to 20MB (generous but safe)
			data, err := io.ReadAll(io.LimitReader(rc, 20*1024*1024))
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
