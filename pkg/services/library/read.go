package library

import (
	"archive/zip"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"yavam/pkg/database"
	"yavam/pkg/models"
	"yavam/pkg/parser"
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

// GetThumbnail returns the cover thumbnail bytes for a package.
// Strategy (cache-first to avoid zip opens):
//  1. Check the thumbnail disk cache using (path + modTime + size) as key.
//  2. On a cache hit: return immediately — no zip open needed.
//  3. On a cache miss: open the zip, extract the thumbnail, cache it, return.
//
// This is called by the frontend's lazy-load IntersectionObserver path for packages
// whose HasThumbnail == true. Because the Hard Pass caches thumbnails as it scans,
// most requests will hit the cache. Only the very first request for a not-yet-scanned
// package will incur a zip open.
func (s *defaultLibraryService) GetThumbnail(pkgPath string) ([]byte, error) {
	// 1. Cache hit
	if s.thumbCache != nil {
		info, err := os.Stat(pkgPath)
		if err == nil {
			if data, ok := s.thumbCache.Get(pkgPath, info.ModTime(), info.Size()); ok {
				return data, nil
			}
		}
	}

	// 2. Cache miss — open zip and extract thumbnail
	_, thumbBytes, _, err := parser.ParseVarMetadata(pkgPath)
	if err != nil {
		return nil, fmt.Errorf("thumbnail: parse failed: %w", err)
	}
	if len(thumbBytes) == 0 {
		return nil, fmt.Errorf("thumbnail: not found in %s", pkgPath)
	}

	// 3. Cache for next time
	if s.thumbCache != nil {
		if info, err := os.Stat(pkgPath); err == nil {
			_ = s.thumbCache.Set(pkgPath, info.ModTime(), info.Size(), thumbBytes)
		}
	}

	return thumbBytes, nil
}

// GetCachedPackages reconstructs a library's packages from the DB index for the
// cache-first grid: it rebuilds each package's dependency map from the persisted
// graph and runs the SAME LinkPass a live scan uses, so cached and freshly
// scanned analysis (duplicates, orphans, missing deps) are identical. Returns
// (nil, nil) when persistence is unavailable or the library is unscanned.
func (s *defaultLibraryService) GetCachedPackages(libraryPath string) ([]models.VarPackage, error) {
	if s.db == nil || libraryPath == "" {
		return nil, nil
	}

	rows, err := s.db.GetPackagesByLibraryPath(libraryPath)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}

	declaredByKey, err := s.db.GetDeclaredDependencies()
	if err != nil {
		return nil, err
	}

	pkgs := make([]models.VarPackage, 0, len(rows))
	for _, r := range rows {
		p := rowToPackage(r, libraryPath)
		if ds := declaredByKey[strings.ToLower(r.PackageKey)]; len(ds) > 0 {
			m := make(map[string]interface{}, len(ds))
			for _, d := range ds {
				m[d] = nil
			}
			p.Meta.Dependencies = m
		}
		pkgs = append(pkgs, p)
	}

	analyses := AnalyzePackages(pkgs, s.db)
	byPath := make(map[string]PackageAnalysis, len(analyses))
	for _, a := range analyses {
		byPath[a.FilePath] = a
	}
	for i := range pkgs {
		if a, ok := byPath[pkgs[i].FilePath]; ok {
			pkgs[i].MissingDeps = a.MissingDeps
			pkgs[i].IsDuplicate = a.IsDuplicate
			pkgs[i].IsExactDuplicate = a.IsExactDuplicate
			pkgs[i].IsOrphan = a.IsOrphan
			pkgs[i].ReferencedBy = a.ReferencedBy
			pkgs[i].ObsoletedBy = a.ObsoletedBy
		}
	}
	return pkgs, nil
}

// rowToPackage reconstructs a VarPackage from a stored index row. The absolute
// FilePath re-applies the ".disabled" suffix for disabled packages so it matches
// what a live scan emits — the frontend dedupes cached vs scanned rows by filePath.
func rowToPackage(r database.PackageRow, libraryPath string) models.VarPackage {
	absPath := filepath.Join(libraryPath, filepath.FromSlash(r.RelPath))
	fileName := r.FileName
	if !r.IsEnabled {
		absPath += ".disabled"
		fileName += ".disabled"
	}

	return models.VarPackage{
		FilePath:      absPath,
		FileName:      fileName,
		Size:          r.SizeBytes,
		IsEnabled:     r.IsEnabled,
		IsCorrupt:     r.IsCorrupt,
		HasThumbnail:  !r.IsCorrupt, // optimistic; lazy load handles misses, the scan corrects
		ThumbnailPath: r.ThumbnailPath,
		LicenseType:   r.LicenseType,
		Type:          r.Type,
		CreationDate:  r.CreationDate,
		Categories:    unmarshalStringSlice(r.CategoriesJSON),
		Tags:          unmarshalStringSlice(r.TagsJSON),
		Meta: models.MetaJSON{
			Creator:     r.Creator,
			PackageName: r.PackageName,
			Version:     r.Version,
			Description: r.Description,
			LicenseType: r.LicenseType,
		},
	}
}

// unmarshalStringSlice is the inverse of marshalStringSlice.
func unmarshalStringSlice(s string) []string {
	if s == "" || s == "[]" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		return nil
	}
	return out
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
