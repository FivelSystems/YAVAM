package library

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"yavam/pkg/models"
)

func TestScanDoesNotBringBackALibraryRemovedWhileItRuns(t *testing.T) {
	db := newGraphTestDB(t)
	libraryPath := t.TempDir()

	fileName := "A.One.1.var"
	filePath := filepath.Join(libraryPath, fileName)
	if err := os.WriteFile(filePath, []byte("not a zip"), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	if err := db.UpsertLibrary(libraryPath); err != nil {
		t.Fatalf("register library: %v", err)
	}

	workerStartHook = func(string) {
		if err := db.DeleteLibrary(libraryPath); err != nil {
			t.Errorf("remove library mid-scan: %v", err)
		}
	}
	t.Cleanup(func() { workerStartHook = nil })

	orc := &scanOrchestrator{
		db:             db,
		libraryPath:    libraryPath,
		bumpPaths:      make(chan priorityRequest, 8),
		onDiscovered:   func(models.VarPackage) {},
		onScanned:      func(models.VarPackage) {},
		onAnalysisDone: func([]PackageAnalysis) {},
		onStage:        func(ScanStageProgress) {},
	}
	rawPkgs := []models.VarPackage{{FilePath: filePath, FileName: fileName, IsEnabled: true}}
	if err := orc.runThreePhase(context.Background(), rawPkgs); err != nil {
		t.Fatalf("runThreePhase: %v", err)
	}

	libraries, err := db.GetLibraryPaths()
	if err != nil {
		t.Fatalf("read libraries: %v", err)
	}
	if len(libraries) != 0 {
		t.Fatalf("scan re-registered a removed library: %v", libraries)
	}
}
