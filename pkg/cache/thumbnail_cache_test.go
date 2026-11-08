package cache

import (
	"testing"
	"time"
)

func TestThumbnailCacheHas(t *testing.T) {
	tc, err := NewThumbnailCache(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	modTime := time.Unix(1700000000, 0)
	const pkgPath = "lib/creator.pkg.1.var"
	const size = int64(1234)

	if tc.Has(pkgPath, modTime, size) {
		t.Fatal("Has reported a hit on an empty cache")
	}
	if err := tc.Set(pkgPath, modTime, size, []byte("thumb")); err != nil {
		t.Fatal(err)
	}
	if !tc.Has(pkgPath, modTime, size) {
		t.Error("Has missed an entry that was just stored")
	}
	if tc.Has(pkgPath, modTime.Add(time.Second), size) {
		t.Error("Has hit after modification time changed")
	}
	if tc.Has(pkgPath, modTime, size+1) {
		t.Error("Has hit after size changed")
	}
}