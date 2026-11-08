package library

import (
	"path/filepath"
	"testing"
	"yavam/pkg/models"
)

func newTestOrchestrator(root string) *scanOrchestrator {
	return &scanOrchestrator{
		libraryPath: root,
		highCh:      make(chan string, 512),
		bumpPaths:   make(chan []string, 64),
	}
}

func discoveredIn(root string, names ...string) []models.VarPackage {
	pkgs := make([]models.VarPackage, 0, len(names))
	for _, name := range names {
		pkgs = append(pkgs, models.VarPackage{FilePath: filepath.Join(root, name)})
	}
	return pkgs
}

func drainOrder(o *scanOrchestrator) []string {
	var order []string
	for path := o.nextPath(); path != ""; path = o.nextPath() {
		order = append(order, filepath.Base(path))
	}
	return order
}

func TestPrioritizeBeforeRegistrationIsAppliedFirst(t *testing.T) {
	root := t.TempDir()
	svc := &defaultLibraryService{}
	svc.Prioritize([]string{filepath.Join(root, "c.var")})

	orc := newTestOrchestrator(root)
	svc.active.register(orc)
	orc.fillQueue(discoveredIn(root, "a.var", "b.var", "c.var"))

	order := drainOrder(orc)
	if len(order) != 3 || order[0] != "c.var" {
		t.Fatalf("expected c.var first of 3, got %v", order)
	}
}

func TestPendingFocusIsClearedAfterScan(t *testing.T) {
	root := t.TempDir()
	svc := &defaultLibraryService{}
	svc.Prioritize([]string{filepath.Join(root, "c.var")})
	svc.active.register(newTestOrchestrator(root))
	svc.active.release()

	next := newTestOrchestrator(root)
	svc.active.register(next)
	next.fillQueue(discoveredIn(root, "a.var", "b.var", "c.var"))

	if order := drainOrder(next); order[0] != "a.var" {
		t.Fatalf("focus leaked into the next scan: %v", order)
	}
}

func TestUnconsumedPendingFocusIsDroppedWhenScanEnds(t *testing.T) {
	root := t.TempDir()
	svc := &defaultLibraryService{}
	svc.active.register(newTestOrchestrator(root))
	svc.active.mu.Lock()
	svc.active.remember([]string{filepath.Join(root, "c.var")})
	svc.active.mu.Unlock()
	svc.active.release()

	if svc.active.pendingFocus != nil {
		t.Fatalf("pending focus survived scan end: %v", svc.active.pendingFocus)
	}
}

func TestLaterPendingFocusReplacesEarlier(t *testing.T) {
	root := t.TempDir()
	svc := &defaultLibraryService{}
	svc.Prioritize([]string{filepath.Join(root, "a.var")})
	svc.Prioritize([]string{filepath.Join(root, "c.var")})

	orc := newTestOrchestrator(root)
	svc.active.register(orc)
	orc.fillQueue(discoveredIn(root, "a.var", "b.var", "c.var"))

	order := drainOrder(orc)
	if order[0] != "c.var" || order[1] != "a.var" {
		t.Fatalf("expected c.var then a.var (a.var back in normal order), got %v", order)
	}
}

func TestPendingFocusIgnoresOtherLibrariesAndUnknownPaths(t *testing.T) {
	root := t.TempDir()
	other := t.TempDir()
	svc := &defaultLibraryService{}
	svc.Prioritize([]string{filepath.Join(other, "b.var"), filepath.Join(root, "ghost.var")})

	orc := newTestOrchestrator(root)
	svc.active.register(orc)
	if len(orc.initialFocus) != 1 {
		t.Fatalf("expected only the in-root path to survive, got %v", orc.initialFocus)
	}
	orc.fillQueue(discoveredIn(root, "a.var", "b.var"))

	order := drainOrder(orc)
	if len(order) != 2 || order[0] != "a.var" {
		t.Fatalf("unknown paths must not change the queue, got %v", order)
	}
}

func TestPendingFocusIsBounded(t *testing.T) {
	root := t.TempDir()
	svc := &defaultLibraryService{}
	paths := make([]string, maxPendingFocusPaths+100)
	for i := range paths {
		paths[i] = filepath.Join(root, "p.var")
	}
	svc.Prioritize(paths)

	if got := len(svc.active.pendingFocus); got != maxPendingFocusPaths {
		t.Fatalf("expected %d pending paths, got %d", maxPendingFocusPaths, got)
	}
}

func TestPrioritizeDuringActiveScanGoesToBumpChannel(t *testing.T) {
	root := t.TempDir()
	svc := &defaultLibraryService{}
	orc := newTestOrchestrator(root)
	svc.active.register(orc)

	target := filepath.Join(root, "c.var")
	svc.Prioritize([]string{target})

	select {
	case got := <-orc.bumpPaths:
		if len(got) != 1 || got[0] != target {
			t.Fatalf("unexpected bump %v", got)
		}
	default:
		t.Fatal("bump was not delivered to the active orchestrator")
	}
	if svc.active.pendingFocus != nil {
		t.Fatalf("active-scan focus must not be remembered: %v", svc.active.pendingFocus)
	}
}
