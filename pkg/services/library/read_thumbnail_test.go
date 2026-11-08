package library

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
	"yavam/pkg/cache"
)

func newThumbnailTestService(t *testing.T, extract func(string) ([]byte, error)) (*defaultLibraryService, string) {
	t.Helper()
	thumbCache, err := cache.NewThumbnailCache(filepath.Join(t.TempDir(), "thumbs"))
	if err != nil {
		t.Fatalf("create cache: %v", err)
	}
	pkgPath := filepath.Join(t.TempDir(), "Maker.Look.1.var")
	if err := os.WriteFile(pkgPath, []byte("not a real zip"), 0o644); err != nil {
		t.Fatalf("write package: %v", err)
	}
	return &defaultLibraryService{thumbCache: thumbCache, extractThumbnail: extract}, pkgPath
}

func TestGetThumbnailCacheHitSkipsExtraction(t *testing.T) {
	extractions := 0
	service, pkgPath := newThumbnailTestService(t, func(string) ([]byte, error) {
		extractions++
		return []byte("fresh"), nil
	})
	info, err := os.Stat(pkgPath)
	if err != nil {
		t.Fatal(err)
	}
	cached := []byte("cached-thumbnail")
	if err := service.thumbCache.Set(pkgPath, info.ModTime(), info.Size(), cached); err != nil {
		t.Fatal(err)
	}

	got, err := service.GetThumbnail(pkgPath)
	if err != nil {
		t.Fatalf("GetThumbnail: %v", err)
	}
	if !bytes.Equal(got, cached) {
		t.Fatalf("expected cached bytes, got %q", got)
	}
	if extractions != 0 {
		t.Fatalf("extraction ran %d times on a cache hit", extractions)
	}
}

func TestGetThumbnailCacheMissPopulatesCache(t *testing.T) {
	extractions := 0
	extracted := []byte("extracted-thumbnail")
	service, pkgPath := newThumbnailTestService(t, func(string) ([]byte, error) {
		extractions++
		return extracted, nil
	})

	got, err := service.GetThumbnail(pkgPath)
	if err != nil {
		t.Fatalf("GetThumbnail: %v", err)
	}
	if !bytes.Equal(got, extracted) {
		t.Fatalf("expected extracted bytes, got %q", got)
	}

	info, err := os.Stat(pkgPath)
	if err != nil {
		t.Fatal(err)
	}
	if stored, ok := service.thumbCache.Get(pkgPath, info.ModTime(), info.Size()); !ok || !bytes.Equal(stored, extracted) {
		t.Fatalf("cache not populated (ok=%v, data=%q)", ok, stored)
	}

	if _, err := service.GetThumbnail(pkgPath); err != nil {
		t.Fatalf("second GetThumbnail: %v", err)
	}
	if extractions != 1 {
		t.Fatalf("expected a single extraction across two calls, got %d", extractions)
	}
}
