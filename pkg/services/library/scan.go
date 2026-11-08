package library

import (
	"context"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"yavam/pkg/cache"
	"yavam/pkg/models"
)

// activeScan holds state for the currently-running three-phase scan so that
// SetCurrentPage / PrioritizePackage can inject priority bumps at any time.
//
// pendingFocus holds the latest focus requested while no scan was registered.
// It is handed to the next scan whose root contains the paths, then dropped;
// it is also dropped when a scan ends, so it never outlives the scan that
// consumed it or leaks into a later one.
type activeScan struct {
	mu           sync.Mutex
	orchestrator *scanOrchestrator
	pendingFocus []string
}

const maxPendingFocusPaths = 512

func (a *activeScan) register(orc *scanOrchestrator) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.orchestrator = orc
	orc.initialFocus = pathsUnderRoot(a.pendingFocus, orc.libraryPath)
	a.pendingFocus = nil
}

func (a *activeScan) release() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.orchestrator = nil
	a.pendingFocus = nil
}

func (a *activeScan) remember(paths []string) {
	if len(paths) > maxPendingFocusPaths {
		paths = paths[:maxPendingFocusPaths]
	}
	a.pendingFocus = append([]string(nil), paths...)
}

func pathsUnderRoot(paths []string, root string) []string {
	var inside []string
	for _, p := range paths {
		rel, err := filepath.Rel(root, p)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			continue
		}
		inside = append(inside, p)
	}
	return inside
}

// ScanFull is the three-phase scan entry point.
func (s *defaultLibraryService) ScanFull(
	ctx context.Context,
	rootPath string,
	onDiscovered func(models.VarPackage),
	onScanned func(models.VarPackage),
	onAnalysisDone func([]PackageAnalysis),
	onStage func(ScanStageProgress),
) error {
	rawPkgs, err := s.scanner.ScanForPackages(rootPath)
	if err != nil {
		return err
	}

	orc := &scanOrchestrator{
		thumbCache:     s.thumbCache,
		db:             s.db,
		libraryPath:    rootPath,
		highCh:         make(chan string, 512),
		bumpPaths:      make(chan []string, 64),
		onDiscovered:   onDiscovered,
		onScanned:      onScanned,
		onAnalysisDone: onAnalysisDone,
		onStage:        onStage,
	}

	s.active.register(orc)
	defer s.active.release()

	return orc.runThreePhase(ctx, rawPkgs)
}

// Prioritize bumps the given paths to the front of the Hard Pass queue.
// Safe to call at any time. With no scan registered yet, the latest request is
// remembered and applied when the next scan registers.
func (s *defaultLibraryService) Prioritize(paths []string) {
	if len(paths) == 0 {
		return
	}
	s.active.mu.Lock()
	orc := s.active.orchestrator
	if orc == nil {
		s.active.remember(paths)
	}
	s.active.mu.Unlock()
	if orc == nil {
		return
	}
	select {
	case orc.bumpPaths <- paths:
	default:
		// Channel full — drop; the package will be scanned in normal order.
	}
}

// SetCurrentPage is a convenience wrapper that bumps the paths for the current page.
func (s *defaultLibraryService) SetCurrentPage(paths []string) {
	s.Prioritize(paths)
}

// ClearThumbnailCache removes all cached thumbnails.
func (s *defaultLibraryService) ClearThumbnailCache() error {
	if s.thumbCache == nil {
		return nil
	}
	return s.thumbCache.Clear()
}

// ThumbnailCacheSize returns the total byte size of the thumbnail cache.
func (s *defaultLibraryService) ThumbnailCacheSize() (int64, error) {
	if s.thumbCache == nil {
		return 0, nil
	}
	return s.thumbCache.Size()
}

// ── Category helpers (unchanged) ─────────────────────────────────────────────

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
			case "Plugin":
				return 5
			case "Scene":
				return 6
			case "Environment":
				return 7
			case "Asset":
				return 8
			case "Sound":
				return 9
			case "Image":
				return 10
			case "Pose":
				return 11
			case "SubScene":
				return 12
			case "PluginPreset":
				return 13
			case "Blueprint":
				return 14
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

// ── Thumbnail cache field injected into the service ───────────────────────────
// (defined here to co-locate with scan logic; accessed from library.go)

// defaultLibraryService extension — thumb cache and active scan state.
// These fields are added to the struct in library.go.
var _ = cache.ThumbnailCache{} // import guard
