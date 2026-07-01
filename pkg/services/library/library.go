package library

import (
	"os"
	"path/filepath"
	"yavam/pkg/cache"
	"yavam/pkg/database"
	"yavam/pkg/fs"
	"yavam/pkg/scanner"
	"yavam/pkg/services/system"
)

type defaultLibraryService struct {
	scanner    *scanner.Scanner
	system     system.SystemService
	fs         fs.FileSystem
	thumbCache *cache.ThumbnailCache
	db         *database.DB // nil = no persistence (tests / legacy callers)

	// active holds state for the currently-running scan so priority bumps
	// from SetCurrentPage / Prioritize can reach the orchestrator.
	active activeScan
}

// NewLibraryService constructs a defaultLibraryService.
// The thumbnail cache is stored in %AppData%/YAVAM/thumbnails/ and is created if absent.
// Pass a *database.DB to enable scan persistence; pass nil to disable it (e.g. in tests).
func NewLibraryService(sys system.SystemService, fileSystem fs.FileSystem, db *database.DB) LibraryService {
	if fileSystem == nil {
		fileSystem = &fs.WindowsFileSystem{}
	}

	// Build thumbnail cache directory.
	var tc *cache.ThumbnailCache
	configDir, err := os.UserConfigDir()
	if err == nil {
		thumbDir := filepath.Join(configDir, "YAVAM", "thumbnails")
		tc, _ = cache.NewThumbnailCache(thumbDir) // non-fatal if it fails
	}

	return &defaultLibraryService{
		scanner:    scanner.NewScanner(),
		system:     sys,
		fs:         fileSystem,
		thumbCache: tc,
		db:         db,
	}
}
