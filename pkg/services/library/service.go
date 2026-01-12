package library

import (
	"context"
	"varmanager/pkg/models"
)

// LibraryService defines the core operations for VAM Package Management
type LibraryService interface {
	// Indexing & Read Operations
	Scan(ctx context.Context, libraryPath string, onPackage func(models.VarPackage), onProgress func(int, int)) error
	GetCounts(libraries []string) map[string]int
	GetPackageContents(pkgPath string) ([]models.PackageContent, error)
	GetThumbnail(pkgPath string) ([]byte, error)

	Install(files []string, targetLib string, overwrite bool, onProgress func(int, int, string)) ([]string, error)
	CheckCollisions(filePaths []string, destLibPath string) ([]string, error)
	CheckDependencies(pkgs []models.VarPackage) []models.VarPackage
	Toggle(pkgPath string, enable bool) (string, error)
	DisableOldVersions(creator string, pkgName string, libraryPath string) error
	ResolveConflicts(keepPath string, others []string, libraryPath string) (*models.ResolveConflictResult, error)
}
