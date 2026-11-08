package library

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"yavam/pkg/database"
	"yavam/pkg/models"
)

const staleScanAgeSeconds = 100

func TestCancelledScanKeepsIndexRowsAndReportsCancellation(t *testing.T) {
	db := newGraphTestDB(t)
	libraryPath := t.TempDir()

	fileNames := []string{"A.One.1.var", "B.Two.1.var", "C.Three.1.var"}
	rawPkgs := make([]models.VarPackage, 0, len(fileNames))
	for _, name := range fileNames {
		path := filepath.Join(libraryPath, name)
		if err := os.WriteFile(path, []byte("not a zip"), 0o600); err != nil {
			t.Fatalf("write fixture: %v", err)
		}
		rawPkgs = append(rawPkgs, models.VarPackage{FilePath: path, FileName: name, IsEnabled: true})
	}

	libraryID, err := db.EnsureLibrary(libraryPath)
	if err != nil {
		t.Fatalf("ensure library: %v", err)
	}
	staleRows := make([]database.PackageRow, 0, len(rawPkgs))
	for _, p := range rawPkgs {
		row := packageToRow(p, libraryID, libraryPath)
		row.ScannedAt = database.Now() - staleScanAgeSeconds
		staleRows = append(staleRows, row)
	}
	if err := db.UpsertPackages(staleRows); err != nil {
		t.Fatalf("seed rows: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Cancel only after the dispatcher has drained the queue, so the last
	// worker starts into a cancelled context and skips its package.
	lastPath := rawPkgs[len(rawPkgs)-1].FilePath
	workerStartHook = func(filePath string) {
		if filePath == lastPath {
			time.Sleep(200 * time.Millisecond)
			cancel()
		}
	}
	t.Cleanup(func() { workerStartHook = nil })

	orc := &scanOrchestrator{
		db:             db,
		libraryPath:    libraryPath,
		highCh:         make(chan string, 8),
		bumpPaths:      make(chan []string, 8),
		onDiscovered:   func(models.VarPackage) {},
		onScanned:      func(models.VarPackage) {},
		onAnalysisDone: func([]PackageAnalysis) { t.Error("analysis delivered for a cancelled scan") },
		onStage:        func(ScanStageProgress) {},
	}

	if err := orc.runThreePhase(ctx, rawPkgs); !errors.Is(err, context.Canceled) {
		t.Fatalf("runThreePhase error = %v, want context.Canceled", err)
	}

	rows, err := db.GetPackagesByLibraryPath(libraryPath)
	if err != nil {
		t.Fatalf("read rows: %v", err)
	}
	if len(rows) != len(fileNames) {
		t.Fatalf("index has %d rows after cancelled scan, want %d (files still exist)", len(rows), len(fileNames))
	}
}
