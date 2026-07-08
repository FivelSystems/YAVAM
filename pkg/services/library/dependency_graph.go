package library

import (
	"log"
	"path/filepath"
	"strconv"
	"strings"

	"yavam/pkg/database"
	"yavam/pkg/models"
)

// familyOf is a package's version-agnostic identity, "creator.name" lower-cased.
// The dependency graph links on this, not on the versioned key.
func familyOf(p models.VarPackage) string {
	return strings.ToLower(p.Meta.Creator + "." + p.Meta.PackageName)
}

// depFamily reduces a declared dependency id to its family by dropping the
// trailing version segment: "Creator.Name.latest" and "Creator.Name.3" both
// become "creator.name". VaM ids always end in a version or "latest".
func depFamily(declared string) string {
	d := strings.ToLower(strings.TrimSpace(declared))
	if i := strings.LastIndex(d, "."); i > 0 {
		return d[:i]
	}
	return d
}

// candidateFamilies returns the family keys an id could match. An id is either a
// declared dependency ("creator.name.version" → family = strip last segment) or
// already a family ("creator.name" from a "used by" entry) — try both.
func candidateFamilies(id string) []string {
	idl := strings.ToLower(strings.TrimSpace(id))
	fams := []string{idl}
	if stripped := depFamily(idl); stripped != idl {
		fams = append(fams, stripped)
	}
	return fams
}

// locateDependencies resolves each id to the best physical package holding its
// family across ALL libraries — enabled preferred, then highest numeric version.
// The best copy per query is returned so the UI can label and jump to it.
func locateDependencies(db *database.DB, ids []string) map[string]models.DependencyLocation {
	out := make(map[string]models.DependencyLocation, len(ids))
	if db == nil || len(ids) == 0 {
		return out
	}

	// Collect the distinct family keys to look up, and remember which families
	// each query could accept.
	familySet := make(map[string]bool)
	queryFamilies := make(map[string][]string, len(ids))
	for _, id := range ids {
		fams := candidateFamilies(id)
		queryFamilies[id] = fams
		for _, f := range fams {
			familySet[f] = true
		}
	}
	families := make([]string, 0, len(familySet))
	for f := range familySet {
		families = append(families, f)
	}

	locs, err := db.FindPackagesByFamilies(families)
	if err != nil {
		log.Printf("[Locate] FindPackagesByFamilies: %v", err)
		return out
	}

	// Index candidate packages by family, keeping the best per family.
	best := make(map[string]database.PackageLocation)
	for _, loc := range locs {
		if cur, ok := best[loc.Family]; !ok || betterCopy(loc, cur) {
			best[loc.Family] = loc
		}
	}

	for _, id := range ids {
		for _, fam := range queryFamilies[id] {
			loc, ok := best[fam]
			if !ok {
				continue
			}
			abs := filepath.Join(loc.LibraryPath, filepath.FromSlash(loc.RelPath))
			if !loc.IsEnabled {
				abs += ".disabled"
			}
			out[id] = models.DependencyLocation{
				Query:        id,
				Found:        true,
				LibraryPath:  loc.LibraryPath,
				LibraryLabel: filepath.Base(loc.LibraryPath),
				FilePath:     abs,
				PackageName:  loc.PackageName,
				Creator:      loc.Creator,
				Version:      loc.Version,
				IsEnabled:    loc.IsEnabled,
			}
			break
		}
	}
	return out
}

// LocateDependencies resolves dependency/dependent ids to the library that holds
// each, for cross-library navigation from the details panel.
func (s *defaultLibraryService) LocateDependencies(ids []string) map[string]models.DependencyLocation {
	return locateDependencies(s.db, ids)
}

// betterCopy reports whether a should be preferred over b as the representative
// copy of a family: enabled wins, then the higher numeric version.
func betterCopy(a, b database.PackageLocation) bool {
	if a.IsEnabled != b.IsEnabled {
		return a.IsEnabled
	}
	av, _ := strconv.Atoi(a.Version)
	bv, _ := strconv.Atoi(b.Version)
	return av > bv
}

// isBuiltinDependency reports ids that ship with VaM and should never count as
// missing (they are not distributed as .var files).
func isBuiltinDependency(declared string) bool {
	d := strings.ToLower(declared)
	return d == "everlaster.core.latest" || strings.HasPrefix(d, "system.")
}

// DependencyGraph is the cross-library view used to resolve dependencies and
// reverse ("used by") lookups, loaded once from the SQLite index.
type DependencyGraph struct {
	// presentFamilies holds every package family that exists in any library; a
	// dependency resolves iff its family is present here.
	presentFamilies map[string]bool
	// reverseByFamily maps a dependency family to the dependent families that
	// require it — the "used by" edges, spanning all libraries.
	reverseByFamily map[string][]string
}

// BuildDependencyGraph loads the global graph from the DB.
func BuildDependencyGraph(db *database.DB) (*DependencyGraph, error) {
	present, err := db.GetPresentFamilies()
	if err != nil {
		return nil, err
	}
	reverse, err := db.GetReverseDependencyFamilies()
	if err != nil {
		return nil, err
	}
	return &DependencyGraph{presentFamilies: present, reverseByFamily: reverse}, nil
}

// AnalyzePackages produces the analysis for pkgs. Duplicate/obsolete detection
// comes from LinkPass (a property of the shown set); dependency analysis
// (missing, used-by, orphan) is then resolved against the global DB graph so it
// is version-agnostic and cross-library. Falls back to LinkPass alone when no DB
// is available.
func AnalyzePackages(pkgs []models.VarPackage, db *database.DB) []PackageAnalysis {
	analyses := LinkPass(pkgs, NewLocalResolver(pkgs))
	if db == nil {
		return analyses
	}
	graph, err := BuildDependencyGraph(db)
	if err != nil {
		log.Printf("[Analysis] dependency graph load failed, using local analysis: %v", err)
		return analyses
	}
	graph.applyTo(analyses, pkgs)
	return analyses
}

// applyTo overwrites the dependency-related fields of analyses (MissingDeps,
// ReferencedBy, IsRemovable) with results resolved against the global graph.
func (g *DependencyGraph) applyTo(analyses []PackageAnalysis, pkgs []models.VarPackage) {
	byPath := make(map[string]models.VarPackage, len(pkgs))
	for _, p := range pkgs {
		byPath[p.FilePath] = p
	}

	for i := range analyses {
		p, ok := byPath[analyses[i].FilePath]
		if !ok {
			continue
		}

		referencedBy := g.dependentsOf(familyOf(p))
		analyses[i].ReferencedBy = referencedBy
		// Enable-agnostic: a disabled package still exists in YAVAM's view, so
		// "no package depends on it" holds regardless of its VaM enabled state.
		analyses[i].IsRemovable = !p.IsCorrupt && p.Meta.Creator != "" && len(referencedBy) == 0

		analyses[i].MissingDeps = g.missingDepsOf(p)
	}
}

// dependentsOf returns the families that depend on family, excluding self.
func (g *DependencyGraph) dependentsOf(family string) []string {
	var out []string
	for _, dependent := range g.reverseByFamily[family] {
		if dependent != family {
			out = append(out, dependent)
		}
	}
	return out
}

// missingDepsOf returns the package's declared dependencies whose family is not
// present in any library (built-ins excluded). Only enabled, non-corrupt
// packages report missing dependencies.
func (g *DependencyGraph) missingDepsOf(p models.VarPackage) []string {
	if !p.IsEnabled || p.IsCorrupt {
		return nil
	}
	var missing []string
	for declared := range p.Meta.Dependencies {
		if isBuiltinDependency(declared) {
			continue
		}
		if !g.presentFamilies[depFamily(declared)] {
			missing = append(missing, declared)
		}
	}
	return missing
}
