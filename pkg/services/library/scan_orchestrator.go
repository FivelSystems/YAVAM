package library

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"yavam/pkg/cache"
	"yavam/pkg/database"
	"yavam/pkg/models"
	"yavam/pkg/parser"
)

// ScanStage identifies which phase of the three-phase scan is active.
type ScanStage string

const (
	StageDiscovery ScanStage = "discovery"
	StageScanning  ScanStage = "scanning"
	StageAnalyzing ScanStage = "analyzing"
)

// ScanStageProgress is emitted via onStage on every meaningful progress tick.
type ScanStageProgress struct {
	Stage   ScanStage `json:"stage"`
	Current int       `json:"current"`
	Total   int       `json:"total"`
	Done    bool      `json:"done"`
}

// scanOrchestrator runs the three-phase scan for a single library path.
type scanOrchestrator struct {
	thumbCache  *cache.ThumbnailCache
	db          *database.DB // nil = no persistence (e.g. legacy callers)
	libraryPath string        // root path being scanned; used for DB operations

	// Priority queue for the Hard Pass.
	highCh      chan string
	normalQueue []string
	pendingMap  map[string]bool
	normalMu    sync.Mutex
	bumpPaths   chan []string

	// Callbacks
	onDiscovered   func(models.VarPackage)
	onScanned      func(models.VarPackage)
	onAnalysisDone func([]PackageAnalysis) // BATCH — called once after all analysis is complete
	onStage        func(ScanStageProgress)
}

// runThreePhase executes all three phases sequentially and blocks until completion.
func (o *scanOrchestrator) runThreePhase(ctx context.Context, rawPkgs []models.VarPackage) error {
	total := len(rawPkgs)

	// ── Phase 1: LIGHT PASS ───────────────────────────────────────────────────
	// No zip opens — emit skeleton entries immediately.
	o.onStage(ScanStageProgress{Stage: StageDiscovery, Current: 0, Total: total})

	discovered := make([]models.VarPackage, 0, total)
	for i, p := range rawPkgs {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		ensureMetaFromFilename(&p)
		discovered = append(discovered, p)
		o.onDiscovered(p)

		if i%50 == 0 || i == total-1 {
			o.onStage(ScanStageProgress{Stage: StageDiscovery, Current: i + 1, Total: total})
		}
	}
	o.onStage(ScanStageProgress{Stage: StageDiscovery, Current: total, Total: total, Done: true})

	// ── Phase 2: HARD PASS ────────────────────────────────────────────────────
	// Open each zip to extract full metadata.
	// Thumbnails are written to the disk cache but NOT embedded in the event payload.
	// The frontend lazy-loads thumbnails on demand via GetPackageThumbnail(),
	// which reads from the cache — preventing all N thumbnails from living in
	// React state simultaneously.
	o.onStage(ScanStageProgress{Stage: StageScanning, Current: 0, Total: total})

	// Record scan start time BEFORE any packages are upserted.
	// After the Hard Pass, any DB record with scanned_at < scanStart was not
	// touched by this scan, meaning the file no longer exists on disk.
	scanStart := database.Now()

	o.normalMu.Lock()
	o.normalQueue = make([]string, 0, total)
	o.pendingMap = make(map[string]bool, total)
	for _, p := range discovered {
		o.normalQueue = append(o.normalQueue, p.FilePath)
		o.pendingMap[p.FilePath] = true
	}
	o.normalMu.Unlock()

	byPath := make(map[string]models.VarPackage, total)
	for _, p := range discovered {
		byPath[p.FilePath] = p
	}

	const workers = 8 // reduced to keep memory pressure lower
	sem := make(chan struct{}, workers)
	var wg sync.WaitGroup
	var scannedMu sync.Mutex
	scannedPkgs := make([]models.VarPackage, 0, total)
	scannedCount := 0

	// stopBump signals the consumer goroutine to exit. We deliberately do NOT
	// close o.bumpPaths here: Prioritize/SetCurrentPage send to it from the
	// Wails message-handler goroutine at any time, and sending on a closed
	// channel panics (a select with a default case does NOT save you — a send
	// on a closed channel panics rather than taking the default). Signalling
	// exit via a separate channel keeps o.bumpPaths open for the orchestrator's
	// whole lifetime; late sends simply buffer or hit Prioritize's default drop.
	stopBump := make(chan struct{})
	bumpDone := make(chan struct{})
	go func() {
		defer close(bumpDone)
		for {
			select {
			case <-ctx.Done():
				return
			case <-stopBump:
				return
			case paths := <-o.bumpPaths:
				o.prepend(paths)
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			wg.Wait()
			return ctx.Err()
		default:
		}

		path := o.nextPath()
		if path == "" {
			break
		}

		wg.Add(1)
		sem <- struct{}{}
		go func(filePath string) {
			defer wg.Done()
			defer func() { <-sem }()

			select {
			case <-ctx.Done():
				return
			default:
			}

			base := byPath[filePath]

			// Check thumbnail cache — if hit, we know there IS a thumbnail but we
			// do NOT embed it in the emitted package. The frontend will request it
			// lazily via GetPackageThumbnail → cache hit → fast disk read, not a zip open.
			hasThumbnail := false
			if o.thumbCache != nil {
				info, err := os.Stat(filePath)
				if err == nil {
					if _, ok := o.thumbCache.Get(filePath, info.ModTime(), info.Size()); ok {
						hasThumbnail = true
					}
				}
			}

			meta, freshThumb, categories, err := parser.ParseVarMetadata(filePath)
			if err == nil {
				// Preserve filename-inferred Creator and PackageName if the zip's meta.json is missing them.
				if meta.Creator == "" {
					meta.Creator = base.Meta.Creator
				}
				if meta.PackageName == "" {
					meta.PackageName = base.Meta.PackageName
				}
				if meta.Version == "" && base.Meta.Version != "" {
					meta.Version = base.Meta.Version
				}
				base.Meta = meta

				// Propagate license type to the top-level field for easy frontend access.
				base.LicenseType = meta.LicenseType

				sortCategories(categories)
				base.Categories = categories
				if len(categories) > 0 {
					base.Type = categories[0]
				} else {
					base.Type = "Other"
				}

				// Normalize tags
				normTags := make([]string, 0, len(meta.Tags))
				for _, t := range meta.Tags {
					normTags = append(normTags, strings.ToLower(t))
				}
				base.Tags = normTags

				// Cache fresh thumbnail if we got one (and didn't already have a cache hit).
				if !hasThumbnail && len(freshThumb) > 0 {
					hasThumbnail = true
					if o.thumbCache != nil {
						info, err2 := os.Stat(filePath)
						if err2 == nil {
							_ = o.thumbCache.Set(filePath, info.ModTime(), info.Size(), freshThumb)
						}
					}
				}

				// Only set HasThumbnail flag — do NOT embed base64 in the event.
				// Embedding all thumbnails bloats Wails event traffic and forces all
				// thumbnail bytes to live in React state simultaneously (RAM explosion).
				base.HasThumbnail = hasThumbnail
				base.ThumbnailBase64 = "" // always empty in events
			} else {
				base.Type = "Other"
				base.IsCorrupt = true
			}

			scannedMu.Lock()
			scannedCount++
			current := scannedCount
			scannedPkgs = append(scannedPkgs, base)
			scannedMu.Unlock()

			o.onScanned(base)
			if current%25 == 0 || current == total {
				o.onStage(ScanStageProgress{Stage: StageScanning, Current: current, Total: total})
			}
		}(path)

		time.Sleep(time.Microsecond)
	}

	wg.Wait()
	close(stopBump)
	<-bumpDone

	o.onStage(ScanStageProgress{Stage: StageScanning, Current: total, Total: total, Done: true})

	// ── DB persistence ────────────────────────────────────────────────────────
	// Batch-upsert all scanned packages into the DB, then remove records for
	// files that no longer exist on disk (scanned_at < scanStart).
	// DB errors are logged but non-fatal: a broken DB must not break scans.
	if o.db != nil {
		// Resolve the library's surrogate id once; every file row references it.
		if libID, err := o.db.EnsureLibrary(o.libraryPath); err != nil {
			log.Printf("[Scanner] DB ensure-library error: %v", err)
		} else {
			dbRows := make([]database.PackageRow, 0, len(scannedPkgs))
			for _, p := range scannedPkgs {
				dbRows = append(dbRows, packageToRow(p, libID, o.libraryPath))
			}
			if err := o.db.UpsertPackages(dbRows); err != nil {
				log.Printf("[Scanner] DB upsert error: %v", err)
			}
			if err := o.db.DeletePackagesOlderThan(libID, scanStart); err != nil {
				log.Printf("[Scanner] DB orphan cleanup error: %v", err)
			}
		}
	}

	// ── Phase 3: LINK PASS ────────────────────────────────────────────────────────
	// Dependency resolution, duplicate detection, orphan analysis.
	// Results are delivered as a SINGLE BATCH to avoid N×O(N) React state updates.
	//
	// Previously: N individual "package:analyzed" events → N calls to setPackages(prev.map())
	//             = O(N²) work for 5,000 packages = 25 million array operations → freeze
	// Now:        1 "scan:analysis:complete" event → 1 call to setPackages(prev.map())
	//             = O(N) work regardless of library size.
	o.onStage(ScanStageProgress{Stage: StageAnalyzing, Current: 0, Total: total})

	local := NewLocalResolver(scannedPkgs)
	analyses := LinkPass(scannedPkgs, local)

	o.onStage(ScanStageProgress{Stage: StageAnalyzing, Current: total, Total: total, Done: true})
	o.onAnalysisDone(analyses) // single batch callback

	return nil
}

// nextPath returns the next path to scan, preferring highCh over normalQueue.
func (o *scanOrchestrator) nextPath() string {
	for {
		select {
		case p := <-o.highCh:
			o.normalMu.Lock()
			if o.pendingMap[p] {
				delete(o.pendingMap, p)
				o.normalMu.Unlock()
				return p
			}
			o.normalMu.Unlock()
			// Already dispatched; ignore and loop.
		default:
			o.normalMu.Lock()
			if len(o.normalQueue) == 0 {
				o.normalMu.Unlock()
				return ""
			}
			p := o.normalQueue[0]
			o.normalQueue = o.normalQueue[1:]
			if o.pendingMap[p] {
				delete(o.pendingMap, p)
				o.normalMu.Unlock()
				return p
			}
			o.normalMu.Unlock()
			// Should be rare, but loop just in case.
		}
	}
}

// prepend moves the given paths to the front of the high-priority channel.
func (o *scanOrchestrator) prepend(paths []string) {
	set := make(map[string]bool, len(paths))
	var toPush []string

	o.normalMu.Lock()
	for _, p := range paths {
		if o.pendingMap[p] {
			toPush = append(toPush, p)
			set[p] = true
		}
	}

	if len(toPush) > 0 {
		filtered := o.normalQueue[:0]
		for _, p := range o.normalQueue {
			if !set[p] {
				filtered = append(filtered, p)
			}
		}
		o.normalQueue = filtered
	}
	o.normalMu.Unlock()

	for _, p := range toPush {
		select {
		case o.highCh <- p:
		default:
		}
	}
}

// packageToRow converts a scanned VarPackage into a database.PackageRow for the
// given library. rel_path and file_name are canonicalised (relative to the
// library root, with any ".disabled" suffix stripped) so the row's identity key
// (library_id, rel_path) stays stable across enable/disable toggles.
// JSON encoding of categories and tags is cheap (in-memory only).
func packageToRow(p models.VarPackage, libraryID int64, libraryPath string) database.PackageRow {
	categoriesJSON := marshalStringSlice(p.Categories)
	tagsJSON := marshalStringSlice(p.Tags)

	// package_key is the logical identity "Creator.PackageName.Version" — indexed
	// but NOT unique: the same key may exist across libraries or folders.
	packageKey := fmt.Sprintf("%s.%s.%s", p.Meta.Creator, p.Meta.PackageName, p.Meta.Version)
	family := fmt.Sprintf("%s.%s", p.Meta.Creator, p.Meta.PackageName)

	relPath := canonicalRelPath(p.FilePath, libraryPath)
	fileName := strings.TrimSuffix(p.FileName, ".disabled")

	return database.PackageRow{
		LibraryID:      libraryID,
		RelPath:        relPath,
		FileName:       fileName,
		SizeBytes:      p.Size,
		IsEnabled:      p.IsEnabled,
		IsCorrupt:      p.IsCorrupt,
		PackageKey:     packageKey,
		Family:         family,
		Creator:        p.Meta.Creator,
		PackageName:    p.Meta.PackageName,
		Version:        p.Meta.Version,
		Description:    p.Meta.Description,
		LicenseType:    p.LicenseType,
		Type:           p.Type,
		CategoriesJSON: categoriesJSON,
		TagsJSON:       tagsJSON,
		ThumbnailPath:  p.ThumbnailPath,
		CreationDate:   p.CreationDate,
		ScannedAt:      database.Now(),
	}
}

// canonicalRelPath returns absPath relative to libraryPath, using forward
// slashes and without any trailing ".disabled" suffix. Falls back to the
// absolute path (slash-normalised) if it cannot be made relative.
func canonicalRelPath(absPath, libraryPath string) string {
	rel, err := filepath.Rel(libraryPath, absPath)
	if err != nil {
		rel = absPath
	}
	rel = filepath.ToSlash(rel)
	return strings.TrimSuffix(rel, ".disabled")
}

// marshalStringSlice JSON-encodes a string slice for SQLite TEXT storage.
// Returns "[]" on nil/empty rather than "null" for consistent query behaviour.
func marshalStringSlice(s []string) string {
	if len(s) == 0 {
		return "[]"
	}
	b, err := json.Marshal(s)
	if err != nil {
		return "[]"
	}
	return string(b)
}
