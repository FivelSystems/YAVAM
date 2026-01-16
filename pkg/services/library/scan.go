package library

import (
	"context"
	"sort"
	"strings"
	"sync"
	"yavam/pkg/models"
	"yavam/pkg/parser"
)

// Scan scans the directory and streams results via callbacks
func (s *defaultLibraryService) Scan(ctx context.Context, rootPath string, onPackage func(models.VarPackage), onProgress func(int, int)) error {
	rawPkgs, err := s.scanner.ScanForPackages(rootPath)
	if err != nil {
		return err
	}

	total := len(rawPkgs)
	processed := 0
	var wg sync.WaitGroup
	// Callback mutex to ensure sequential writes
	var cbMu sync.Mutex

	// Channels for tags/deduplication if needed?
	// Manager filtered duplicate tags.
	tagSet := make(map[string]bool)
	var tagMu sync.Mutex

	// Semaphore to limit concurrency
	sem := make(chan struct{}, 20)

	// Notify initial progress
	if onProgress != nil {
		onProgress(0, total)
	}

	for _, pkg := range rawPkgs {
		// Check cancellation
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		wg.Add(1)
		go func(p models.VarPackage) {
			defer wg.Done()

			select {
			case <-ctx.Done():
				return
			default:
			}

			sem <- struct{}{}        // Acquire
			defer func() { <-sem }() // Release

			// Double check cancellation after acquire
			select {
			case <-ctx.Done():
				return
			default:
			}

			meta, thumbBytes, categories, err := parser.ParseVarMetadata(p.FilePath)
			if err == nil {
				p.Meta = meta

				// Sort Categories for stability and primary type selection
				sortCategories(categories)
				p.Categories = categories
				if len(categories) > 0 {
					p.Type = categories[0]
				} else {
					p.Type = "Unknown"
				}

				p.Tags = meta.Tags
				p.HasThumbnail = len(thumbBytes) > 0
			} else {
				p.Type = "Unknown"
				p.IsCorrupt = true
			}

			// Fix empty fields from filename
			ensureMetaFromFilename(&p)

			// Normalize Tags
			var normalizedTags []string
			tagMu.Lock()
			for _, t := range p.Tags {
				lowerT := strings.ToLower(t)
				normalizedTags = append(normalizedTags, lowerT)
				tagSet[lowerT] = true
			}
			tagMu.Unlock()
			p.Tags = normalizedTags

			// TODO: Status Logic (Duplicate, Obsolete) - Requires global view?
			// Manager.resolveDuplicates processed the WHOLE list *after* scan in GetPackages?
			// Wait, ScanAndAnalyze streams individual packages.
			// It does NOT return the full list.
			// The Caller (App) accumulated them and then presumably called resolveDuplicates?
			// Checking `pkg/manager/manager.go` around line 250...
			// `resolveDuplicates` is a helper method.
			// `App` calls `ScanAndAnalyze`.
			// `App` in `GetFilters` used it.

			// Wait, `resolveDuplicates` was NOT called inside `ScanAndAnalyze` in Manager.
			// The UI/Frontend likely handled it or `App.go`?
			// I need to check `App.go` or usage of `resolveDuplicates`.
			// Searching checks... `Manager.resolveDuplicates` is unexported?
			// If it's unexported and not called in `ScanAndAnalyze`, who calls it?
			// Maybe `GetPackages`? (Which I might have missed or it was removed/renamed?)
			// Ah, I see `checkDependencies` and `resolveDuplicates` in `manager.go`.
			// Are they used?

			// If the Service is responsible for "Status Logic", it should likely be a post-processing step
			// or done on the fly if state is maintained.
			// For now, implementing the pure Scan logic.

			cbMu.Lock()
			current := processed + 1
			processed = current

			if onPackage != nil {
				onPackage(p)
			}
			if onProgress != nil {
				if current%10 == 0 || current == total {
					onProgress(current, total)
				}
			}
			cbMu.Unlock()

		}(pkg)
	}

	wg.Wait()
	return nil
}

func sortCategories(categories []string) {
	sort.Slice(categories, func(i, j int) bool {
		prio := func(s string) int {
			switch s {
			case "Look":
				return 0
			case "Clothing":
				return 1
			case "Hair":
				return 2
			case "Skin":
				return 3
			case "Morph":
				return 4
			case "Script":
				return 5
			case "Scene":
				return 6
			case "Environment":
				return 7
			case "Asset":
				return 8
			default:
				return 99
			}
		}
		pi, pj := prio(categories[i]), prio(categories[j])
		if pi != pj {
			return pi < pj
		}
		return categories[i] < categories[j]
	})
}

func ensureMetaFromFilename(p *models.VarPackage) {
	if p.Meta.Creator == "" || p.Meta.PackageName == "" {
		cleanName := p.FileName
		lower := strings.ToLower(cleanName)
		if strings.HasSuffix(lower, ".var.disabled") {
			cleanName = cleanName[:len(cleanName)-len(".var.disabled")]
		} else if strings.HasSuffix(lower, ".var") {
			cleanName = cleanName[:len(cleanName)-len(".var")]
		}

		parts := strings.Split(cleanName, ".")
		if len(parts) >= 3 {
			if p.Meta.Creator == "" {
				c := parts[0]
				if len(c) > 0 {
					p.Meta.Creator = strings.ToUpper(c[:1]) + c[1:]
				} else {
					p.Meta.Creator = c
				}
			}
			if p.Meta.PackageName == "" {
				pn := parts[1]
				if len(pn) > 0 {
					p.Meta.PackageName = strings.ToUpper(pn[:1]) + pn[1:]
				} else {
					p.Meta.PackageName = pn
				}
			}
			if p.Meta.Version == "" {
				p.Meta.Version = parts[len(parts)-1]
			}
		}
	}
}
