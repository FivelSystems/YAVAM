package library

import (
	"context"
	"yavam/pkg/models"
)

// LibraryService defines the core operations for VAM Package Management.
type LibraryService interface {
	// ── Scan ──────────────────────────────────────────────────────────────────

	// Scan is the legacy single-callback scan entry point (preserved for backward compatibility).
	Scan(ctx context.Context, libraryPath string, onPackage func(models.VarPackage), onProgress func(int, int)) error

	// ScanFull is the three-phase scan entry point.
	// onDiscovered    fires during the Light Pass (skeleton data, no zip open).
	// onScanned       fires during the Hard Pass (full metadata; NO thumbnail bytes in payload).
	// onAnalysisDone  fires ONCE after the Link Pass with ALL results as a batch.
	//                 This avoids N×O(N) React state updates for large libraries.
	// onStage         fires on every meaningful progress tick across all three phases.
	ScanFull(
		ctx context.Context,
		libraryPath string,
		onDiscovered func(models.VarPackage),
		onScanned func(models.VarPackage),
		onAnalysisDone func([]PackageAnalysis),
		onStage func(ScanStageProgress),
	) error

	// Prioritize bumps the given package paths to the front of the Hard Pass queue.
	// Safe to call at any time; no-op if the Hard Pass is not currently running.
	Prioritize(paths []string)

	// SetCurrentPage is a convenience wrapper for Prioritize with page-change semantics.
	SetCurrentPage(paths []string)

	// ── Thumbnail Cache ───────────────────────────────────────────────────────

	ClearThumbnailCache() error
	ThumbnailCacheSize() (int64, error)

	// ── Read Operations ───────────────────────────────────────────────────────

	GetCounts(libraries []string) map[string]int
	GetPackageContents(pkgPath string) ([]models.PackageContent, error)
	GetThumbnail(pkgPath string) ([]byte, error)

	// ── Write Operations ──────────────────────────────────────────────────────

	Install(files []string, targetLib string, overwrite bool, onProgress func(int, int, string)) ([]string, error)
	CheckCollisions(filePaths []string, destLibPath string) ([]string, error)
	CheckDependencies(pkgs []models.VarPackage) []models.VarPackage
	Toggle(pkgPath string, enable bool) (string, error)
	DisableOldVersions(creator string, pkgName string, libraryPath string) error
	ResolveConflicts(keepPath string, others []string, libraryPath string) (*models.ResolveConflictResult, error)
}
