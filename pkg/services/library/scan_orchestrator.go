package library

import (
	"context"
	"os"
	"strings"
	"sync"
	"time"
	"yavam/pkg/cache"
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
	thumbCache *cache.ThumbnailCache

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

	bumpDone := make(chan struct{})
	go func() {
		defer close(bumpDone)
		for {
			select {
			case <-ctx.Done():
				return
			case paths, ok := <-o.bumpPaths:
				if !ok {
					return
				}
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
	close(o.bumpPaths)
	<-bumpDone

	o.onStage(ScanStageProgress{Stage: StageScanning, Current: total, Total: total, Done: true})

	// ── Phase 3: LINK PASS ────────────────────────────────────────────────────
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
