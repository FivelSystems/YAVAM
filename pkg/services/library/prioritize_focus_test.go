package library

import (
	"fmt"
	"path/filepath"
	"reflect"
	"testing"
)

func pathsIn(root string, names ...string) []string {
	paths := make([]string, 0, len(names))
	for _, name := range names {
		paths = append(paths, filepath.Join(root, name))
	}
	return paths
}

func queuedOrchestrator(root string, names ...string) *scanOrchestrator {
	orc := newTestOrchestrator(root)
	orc.fillQueue(discoveredIn(root, names...))
	return orc
}

func TestNewPageFocusReplacesPendingPreviousFocus(t *testing.T) {
	root := t.TempDir()
	orc := queuedOrchestrator(root, "a", "b", "c", "d", "e", "f")

	orc.prioritize(pathsIn(root, "a", "b"), true)
	orc.prioritize(pathsIn(root, "e", "d"), true)

	order := drainOrder(orc)
	want := []string{"e", "d", "a", "b", "c", "f"}
	if !reflect.DeepEqual(order, want) {
		t.Fatalf("expected %v, got %v", want, order)
	}
}

func TestReplacedFocusIsStillScannedEventually(t *testing.T) {
	root := t.TempDir()
	orc := queuedOrchestrator(root, "a", "b", "c", "d")

	orc.prioritize(pathsIn(root, "a", "b"), true)
	orc.prioritize(pathsIn(root, "d"), true)

	order := drainOrder(orc)
	if len(order) != 4 {
		t.Fatalf("every package must be scanned exactly once, got %v", order)
	}
	seen := map[string]bool{}
	for _, name := range order {
		if seen[name] {
			t.Fatalf("%s scanned twice: %v", name, order)
		}
		seen[name] = true
	}
}

func TestStartedPathsAreNotRequeuedByReplace(t *testing.T) {
	root := t.TempDir()
	orc := queuedOrchestrator(root, "a", "b", "c")

	orc.prioritize(pathsIn(root, "a", "b"), true)
	if first := filepath.Base(orc.nextPath()); first != "a" {
		t.Fatalf("expected a first, got %s", first)
	}
	orc.prioritize(pathsIn(root, "c"), true)

	if order, want := drainOrder(orc), []string{"c", "b"}; !reflect.DeepEqual(order, want) {
		t.Fatalf("expected %v, got %v", want, order)
	}
}

func TestSinglePackagePrioritizeAppendsWithoutReplacing(t *testing.T) {
	root := t.TempDir()
	orc := queuedOrchestrator(root, "a", "b", "c", "d", "e")

	orc.prioritize(pathsIn(root, "b", "c"), true)
	orc.prioritize(pathsIn(root, "e"), false)

	order := drainOrder(orc)
	want := []string{"b", "c", "e", "a", "d"}
	if !reflect.DeepEqual(order, want) {
		t.Fatalf("expected %v, got %v", want, order)
	}
}

func TestFocusLargerThanFormerChannelCapacityKeepsOrder(t *testing.T) {
	root := t.TempDir()
	const count = 2000
	names := make([]string, count)
	for i := range names {
		names[i] = fmt.Sprintf("p%04d", i)
	}
	orc := queuedOrchestrator(root, names...)

	reversed := make([]string, count)
	for i, name := range names {
		reversed[count-1-i] = name
	}
	orc.prioritize(pathsIn(root, reversed...), true)

	order := drainOrder(orc)
	if !reflect.DeepEqual(order, reversed) {
		t.Fatalf("focus order lost: first %v", order[:5])
	}
}

func TestPrioritizeIgnoresUnknownAndRepeatedPaths(t *testing.T) {
	root := t.TempDir()
	orc := queuedOrchestrator(root, "a", "b", "c")

	orc.prioritize(pathsIn(root, "ghost", "c", "c", "../outside"), true)

	order := drainOrder(orc)
	want := []string{"c", "a", "b"}
	if !reflect.DeepEqual(order, want) {
		t.Fatalf("expected %v, got %v", want, order)
	}
}

func TestConcurrentPrioritizeNeverLosesOrDuplicatesPackages(t *testing.T) {
	root := t.TempDir()
	names := make([]string, 300)
	for i := range names {
		names[i] = fmt.Sprintf("p%03d", i)
	}
	orc := queuedOrchestrator(root, names...)

	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; i < 200; i++ {
			orc.prioritize(pathsIn(root, names[i%len(names):]...), i%2 == 0)
		}
	}()

	seen := map[string]bool{}
	for path := orc.nextPath(); path != ""; path = orc.nextPath() {
		if seen[path] {
			t.Fatalf("%s dispatched twice", path)
		}
		seen[path] = true
	}
	<-done
	for path := orc.nextPath(); path != ""; path = orc.nextPath() {
		seen[path] = true
	}
	if len(seen) != len(names) {
		t.Fatalf("expected %d packages dispatched, got %d", len(names), len(seen))
	}
}
