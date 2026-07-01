package library

import (
	"path/filepath"
	"testing"

	"yavam/pkg/database"
	"yavam/pkg/models"
)

func newGraphTestDB(t *testing.T) *database.DB {
	t.Helper()
	db, err := database.Open(filepath.Join(t.TempDir(), "graph.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func mkPkg(creator, name, version string, deps ...string) models.VarPackage {
	m := make(map[string]interface{}, len(deps))
	for _, d := range deps {
		m[d] = nil
	}
	id := creator + "." + name + "." + version + ".var"
	return models.VarPackage{
		FilePath:  id,
		FileName:  id,
		IsEnabled: true,
		Meta:      models.MetaJSON{Creator: creator, PackageName: name, Version: version, Dependencies: m},
	}
}

// TestReverseDependencyAcrossVersions is the regression test for GitHub #45:
// "used by" must resolve on family, not the versioned string, so a package is
// found as a dependency even when dependents declared `.latest` or a different
// version than the copy installed.
func TestReverseDependencyAcrossVersions(t *testing.T) {
	db := newGraphTestDB(t)

	base := mkPkg("Studio", "Base", "5")                       // installed version 5
	sceneB := mkPkg("Studio", "SceneB", "1", "Studio.Base.latest") // needs it via .latest
	sceneC := mkPkg("Studio", "SceneC", "2", "Studio.Base.3")      // needs a different version
	pkgs := []models.VarPackage{base, sceneB, sceneC}

	libID, err := db.EnsureLibrary("D:/Lib")
	if err != nil {
		t.Fatalf("EnsureLibrary: %v", err)
	}
	rows := make([]database.PackageRow, 0, len(pkgs))
	for _, p := range pkgs {
		rows = append(rows, packageToRow(p, libID, "D:/Lib"))
	}
	if err := db.UpsertPackages(rows); err != nil {
		t.Fatalf("UpsertPackages: %v", err)
	}
	persistDependencies(db, pkgs)

	byPath := make(map[string]PackageAnalysis)
	for _, a := range AnalyzePackages(pkgs, db) {
		byPath[a.FilePath] = a
	}

	baseAnalysis := byPath[base.FilePath]
	if len(baseAnalysis.ReferencedBy) != 2 {
		t.Fatalf("Base should be used by 2 families despite version/.latest mismatch, got %v", baseAnalysis.ReferencedBy)
	}
	if baseAnalysis.IsOrphan {
		t.Fatalf("Base is referenced, must not be flagged orphan")
	}

	// The dependency is present, so dependents report nothing missing.
	if got := byPath[sceneB.FilePath].MissingDeps; len(got) != 0 {
		t.Fatalf("SceneB dep should resolve to the present family, got missing %v", got)
	}
	if got := byPath[sceneC.FilePath].MissingDeps; len(got) != 0 {
		t.Fatalf("SceneC dep should resolve to the present family, got missing %v", got)
	}
}

// TestReverseDependencyIsDistinctPerPackageCrossLibrary is an independent
// evaluation of the "used by is the same everywhere" report: it scans two
// libraries with overlapping dependents and asserts each base package gets its
// OWN, correct dependent set (and logs them so the real output is observable).
func TestReverseDependencyIsDistinctPerPackageCrossLibrary(t *testing.T) {
	db := newGraphTestDB(t)

	// Library 1: two independent base packages + two scenes using one each.
	baseA := mkPkg("Studio", "BaseA", "5")
	baseB := mkPkg("Studio", "BaseB", "2")
	sceneX := mkPkg("Studio", "SceneX", "1", "Studio.BaseA.latest")
	sceneY := mkPkg("Studio", "SceneY", "1", "Studio.BaseB.latest")
	lib1 := []models.VarPackage{baseA, baseB, sceneX, sceneY}

	// Library 2: a scene in a DIFFERENT library that also uses BaseA (via a
	// different version) — this is the cross-library dependent.
	sceneZ := mkPkg("Other", "SceneZ", "1", "Studio.BaseA.3")
	lib2 := []models.VarPackage{sceneZ}

	upsert := func(path string, pkgs []models.VarPackage) {
		id, err := db.EnsureLibrary(path)
		if err != nil {
			t.Fatalf("EnsureLibrary %s: %v", path, err)
		}
		rows := make([]database.PackageRow, 0, len(pkgs))
		for _, p := range pkgs {
			rows = append(rows, packageToRow(p, id, path))
		}
		if err := db.UpsertPackages(rows); err != nil {
			t.Fatalf("UpsertPackages %s: %v", path, err)
		}
		persistDependencies(db, pkgs) // per-library, as real scans do
	}
	upsert("D:/Lib1", lib1)
	upsert("D:/Lib2", lib2)

	// Analyze library 1 (what the grid would show) against the global graph.
	byPath := make(map[string]PackageAnalysis)
	for _, a := range AnalyzePackages(lib1, db) {
		byPath[a.FilePath] = a
		t.Logf("used-by[%s] = %v (orphan=%v)", a.FilePath, a.ReferencedBy, a.IsOrphan)
	}

	a := byPath[baseA.FilePath].ReferencedBy
	b := byPath[baseB.FilePath].ReferencedBy

	// BaseA is used by SceneX (lib1) AND SceneZ (lib2, different version).
	if len(a) != 2 {
		t.Fatalf("BaseA used-by should be 2 (SceneX + cross-lib SceneZ), got %v", a)
	}
	// BaseB is used only by SceneY.
	if len(b) != 1 || b[0] != "studio.sceney" {
		t.Fatalf("BaseB used-by should be [studio.sceney], got %v", b)
	}
	// The whole point: the two lists are DIFFERENT, not "the same everywhere".
	if len(a) == len(b) && a[0] == b[0] {
		t.Fatalf("BaseA and BaseB must have distinct used-by lists; got identical %v", a)
	}
}

// TestLocateDependenciesCrossLibrary verifies a dependency/dependent id resolves
// to the library that actually holds it — the backend for click-to-jump.
func TestLocateDependenciesCrossLibrary(t *testing.T) {
	db := newGraphTestDB(t)

	// BaseA lives in Lib1; the dependent SceneZ lives in Lib2.
	baseA := mkPkg("Studio", "BaseA", "5")
	sceneZ := mkPkg("Other", "SceneZ", "1", "Studio.BaseA.3")

	lib1, _ := db.EnsureLibrary(`D:\Lib1`)
	lib2, _ := db.EnsureLibrary(`D:\Lib2`)
	db.UpsertPackages([]database.PackageRow{packageToRow(baseA, lib1, `D:\Lib1`)})
	db.UpsertPackages([]database.PackageRow{packageToRow(sceneZ, lib2, `D:\Lib2`)})

	// Query by a declared dependency id (.3) and by a bare family.
	got := locateDependencies(db, []string{"Studio.BaseA.latest", "other.scenez"})

	base := got["Studio.BaseA.latest"]
	if !base.Found || base.LibraryPath != `D:\Lib1` {
		t.Fatalf("BaseA should resolve to Lib1, got %+v", base)
	}
	if base.LibraryLabel != "Lib1" {
		t.Fatalf("expected library label Lib1, got %q", base.LibraryLabel)
	}

	dep := got["other.scenez"]
	if !dep.Found || dep.LibraryPath != `D:\Lib2` {
		t.Fatalf("SceneZ should resolve to Lib2, got %+v", dep)
	}

	// An id present nowhere resolves to nothing (not an error).
	if _, ok := locateDependencies(db, []string{"ghost.missing.1"})["ghost.missing.1"]; ok {
		t.Fatalf("unknown id must not resolve")
	}
}

// TestMissingDependencyByFamily verifies a dependency on a family absent from all
// libraries is reported missing, while built-ins are ignored.
func TestMissingDependencyByFamily(t *testing.T) {
	db := newGraphTestDB(t)

	scene := mkPkg("Studio", "Scene", "1", "Ghost.Missing.2", "Everlaster.Core.latest")
	pkgs := []models.VarPackage{scene}

	libID, _ := db.EnsureLibrary("D:/Lib")
	db.UpsertPackages([]database.PackageRow{packageToRow(scene, libID, "D:/Lib")})
	persistDependencies(db, pkgs)

	analyses := AnalyzePackages(pkgs, db)
	missing := analyses[0].MissingDeps
	if len(missing) != 1 || missing[0] != "Ghost.Missing.2" {
		t.Fatalf("expected only Ghost.Missing.2 missing (built-in ignored), got %v", missing)
	}
}
