package library

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"yavam/pkg/cache"
	"yavam/pkg/models"
	"yavam/pkg/parser"
)

func TestHardPassSkipsThumbnailExtractionOnCacheHit(t *testing.T) {
	libDir := t.TempDir()
	hitPath := filepath.Join(libDir, "creator.hit.1.var")
	missPath := filepath.Join(libDir, "creator.miss.1.var")
	for _, p := range []string{hitPath, missPath} {
		if err := os.WriteFile(p, []byte("not parsed, parser is faked"), 0644); err != nil {
			t.Fatal(err)
		}
	}

	thumbCache, err := cache.NewThumbnailCache(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	hitInfo, _ := os.Stat(hitPath)
	if err := thumbCache.Set(hitPath, hitInfo.ModTime(), hitInfo.Size(), []byte("cached")); err != nil {
		t.Fatal(err)
	}

	var mu sync.Mutex
	extractRequested := map[string]bool{}
	var parseCalls atomic.Int32

	orc := &scanOrchestrator{
		thumbCache:     thumbCache,
		libraryPath:    libDir,
		highCh:         make(chan string, 8),
		bumpPaths:      make(chan []string, 8),
		onDiscovered:   func(models.VarPackage) {},
		onAnalysisDone: func([]PackageAnalysis) {},
		onStage:        func(ScanStageProgress) {},
		parse: func(path string, opts parser.ParseOptions) (models.MetaJSON, []byte, []string, error) {
			parseCalls.Add(1)
			mu.Lock()
			extractRequested[path] = opts.ExtractThumbnail
			mu.Unlock()
			if opts.ExtractThumbnail {
				return models.MetaJSON{}, []byte("fresh"), nil, nil
			}
			return models.MetaJSON{}, nil, nil, nil
		},
	}
	scanned := map[string]models.VarPackage{}
	orc.onScanned = func(p models.VarPackage) {
		mu.Lock()
		scanned[p.FilePath] = p
		mu.Unlock()
	}

	raw := []models.VarPackage{{FilePath: hitPath}, {FilePath: missPath}}
	if err := orc.runThreePhase(context.Background(), raw); err != nil {
		t.Fatal(err)
	}

	if parseCalls.Load() != 2 {
		t.Fatalf("expected 2 parses, got %d", parseCalls.Load())
	}
	if extractRequested[hitPath] {
		t.Error("cache hit still requested thumbnail extraction")
	}
	if !extractRequested[missPath] {
		t.Error("cache miss did not request thumbnail extraction")
	}
	if !scanned[hitPath].HasThumbnail {
		t.Error("cache hit lost HasThumbnail")
	}
	if !scanned[missPath].HasThumbnail {
		t.Error("cache miss with fresh thumbnail lost HasThumbnail")
	}
	missInfo, _ := os.Stat(missPath)
	if !thumbCache.Has(missPath, missInfo.ModTime(), missInfo.Size()) {
		t.Error("fresh thumbnail was not written to the cache")
	}
}