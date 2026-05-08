package cache

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// ThumbnailCache is a content-addressed, disk-backed cache for package cover thumbnails.
//
// Key design choices:
//   - Only package-level thumbnails are cached (not per-content thumbnails from the RightSidebar).
//     This keeps storage predictable: typically 50–300 KB per package.
//   - The cache key encodes file path, modification time, and file size so that any change to the
//     .var file (rename, update) automatically invalidates its entry — no manual expiry needed.
//   - Files are stored flat in the cache directory as "<sha256hex>.jpg" (JPEG regardless of source
//     format — thumbnails from VaM are always JPEG in practice).
type ThumbnailCache struct {
	dir string
}

// NewThumbnailCache creates a cache rooted at dir (created if absent).
func NewThumbnailCache(dir string) (*ThumbnailCache, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("thumbnail cache: mkdir %s: %w", dir, err)
	}
	return &ThumbnailCache{dir: dir}, nil
}

// cacheKey returns the hex-encoded SHA-256 of the compound identity string.
func (c *ThumbnailCache) cacheKey(pkgPath string, modTime time.Time, size int64) string {
	raw := fmt.Sprintf("%s|%d|%d", pkgPath, modTime.UnixNano(), size)
	sum := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", sum)
}

func (c *ThumbnailCache) cachePath(key string) string {
	return filepath.Join(c.dir, key+".jpg")
}

// Get returns cached thumbnail bytes for the given package identity, or (nil, false) on a miss.
func (c *ThumbnailCache) Get(pkgPath string, modTime time.Time, size int64) ([]byte, bool) {
	key := c.cacheKey(pkgPath, modTime, size)
	data, err := os.ReadFile(c.cachePath(key))
	if err != nil {
		return nil, false
	}
	return data, true
}

// Set writes thumbnail bytes to disk for the given package identity.
// Errors are non-fatal — a cache write failure just means the next scan will re-parse the zip.
func (c *ThumbnailCache) Set(pkgPath string, modTime time.Time, size int64, data []byte) error {
	key := c.cacheKey(pkgPath, modTime, size)
	return os.WriteFile(c.cachePath(key), data, 0644)
}

// Clear removes every file in the cache directory.
func (c *ThumbnailCache) Clear() error {
	entries, err := os.ReadDir(c.dir)
	if err != nil {
		return fmt.Errorf("thumbnail cache: readdir: %w", err)
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		_ = os.Remove(filepath.Join(c.dir, e.Name()))
	}
	return nil
}

// Size returns the total byte size of all files currently in the cache.
func (c *ThumbnailCache) Size() (int64, error) {
	entries, err := os.ReadDir(c.dir)
	if err != nil {
		return 0, fmt.Errorf("thumbnail cache: readdir: %w", err)
	}
	var total int64
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err == nil {
			total += info.Size()
		}
	}
	return total, nil
}
