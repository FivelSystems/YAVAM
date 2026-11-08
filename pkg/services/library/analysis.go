package library

import (
	"fmt"
	"strings"
	"yavam/pkg/models"
)

// PackageAnalysis holds the analysis results for a single package from the Link Pass.
// This struct is emitted as the "package:analyzed" event payload.
type PackageAnalysis struct {
	FilePath        string   `json:"filePath"`
	MissingDeps     []string `json:"missingDeps"`
	IsDuplicate     bool     `json:"isDuplicate"`     // Obsoleted by a newer version
	IsExactDuplicate bool    `json:"isExactDuplicate"` // Identical copy (same version + size)
	IsRemovable     bool     `json:"isRemovable"`     // Not referenced by any enabled package, so removing it breaks nothing
	ObsoletedBy     string   `json:"obsoletedBy,omitempty"`
	ReferencedBy    []string `json:"referencedBy,omitempty"`
}

// LinkPass runs full dependency, duplicate and orphan analysis over all scanned packages.
//
// Dependencies are resolved against the packages in pkgs themselves.
//
// This function is intentionally pure: it takes a slice and returns analysis results without
// mutating the input packages. The caller (scan_orchestrator) applies them back.
func LinkPass(pkgs []models.VarPackage) []PackageAnalysis {
	if len(pkgs) == 0 {
		return nil
	}

	resolver := newLocalResolver(pkgs)

	// ── Group packages by "Creator.PackageName" for duplicate detection ──────
	type group struct {
		pkgs []models.VarPackage
	}
	groups := make(map[string]*group)
	for _, p := range pkgs {
		if p.IsCorrupt {
			continue
		}
		key := strings.ToLower(p.Meta.Creator + "." + p.Meta.PackageName)
		if _, ok := groups[key]; !ok {
			groups[key] = &group{}
		}
		groups[key].pkgs = append(groups[key].pkgs, p)
	}

	obsoletePaths := make(map[string]string) // filePath → reason
	redundantPaths := make(map[string]string)

	compareVersions := func(v1, v2 string) int {
		if v1 == v2 {
			return 0
		}
		p1 := strings.Split(v1, ".")
		p2 := strings.Split(v2, ".")
		l := len(p1)
		if len(p2) > l {
			l = len(p2)
		}
		for i := 0; i < l; i++ {
			var n1, n2 int
			if i < len(p1) {
				fmt.Sscanf(p1[i], "%d", &n1)
			}
			if i < len(p2) {
				fmt.Sscanf(p2[i], "%d", &n2)
			}
			if n1 > n2 {
				return 1
			}
			if n1 < n2 {
				return -1
			}
		}
		return 0
	}

	for _, g := range groups {
		if len(g.pkgs) <= 1 {
			continue
		}
		// Sort: enabled first, then descending version
		sorted := make([]models.VarPackage, len(g.pkgs))
		copy(sorted, g.pkgs)
		for i := 0; i < len(sorted); i++ {
			for j := i + 1; j < len(sorted); j++ {
				a, b := sorted[i], sorted[j]
				swap := false
				if !a.IsEnabled && b.IsEnabled {
					swap = true
				} else if a.IsEnabled == b.IsEnabled {
					if compareVersions(b.Meta.Version, a.Meta.Version) > 0 {
						swap = true
					}
				}
				if swap {
					sorted[i], sorted[j] = sorted[j], sorted[i]
				}
			}
		}
		head := sorted[0]
		for _, other := range sorted[1:] {
			cmp := compareVersions(other.Meta.Version, head.Meta.Version)
			if cmp == 0 {
				redundantPaths[other.FilePath] = fmt.Sprintf("Identical copy of %s", head.FilePath)
			} else {
				obsoletePaths[other.FilePath] = fmt.Sprintf("Obsoleted by v%s (%s)", head.Meta.Version, head.FileName)
			}
		}
	}

	// ── Exact duplicate detection (same version + same size) ─────────────────
	exactKey := func(p models.VarPackage) string {
		return strings.ToLower(fmt.Sprintf("%s.%s.%s|%d", p.Meta.Creator, p.Meta.PackageName, p.Meta.Version, p.Size))
	}
	exactCounts := make(map[string]int)
	for _, p := range pkgs {
		if !p.IsCorrupt {
			exactCounts[exactKey(p)]++
		}
	}

	// ── Orphan / reverse-dependency graph ────────────────────────────────────
	// An orphan is an enabled, non-corrupt package that is not referenced by any
	// other enabled package's dependency list.
	reverseDeps := make(map[string][]string) // pkgID → [referencedBy IDs]
	pkgIDSet := make(map[string]bool)
	for _, p := range pkgs {
		if p.IsCorrupt || p.Meta.Creator == "" {
			continue
		}
		id := strings.ToLower(fmt.Sprintf("%s.%s.%s", p.Meta.Creator, p.Meta.PackageName, p.Meta.Version))
		pkgIDSet[id] = true
	}
	for _, p := range pkgs {
		if p.IsCorrupt || !p.IsEnabled {
			continue
		}
		myID := strings.ToLower(fmt.Sprintf("%s.%s.%s", p.Meta.Creator, p.Meta.PackageName, p.Meta.Version))
		for depID := range p.Meta.Dependencies {
			dLower := strings.ToLower(depID)
			reverseDeps[dLower] = append(reverseDeps[dLower], myID)
		}
	}
	referenced := make(map[string]bool)
	for depID := range reverseDeps {
		referenced[depID] = true
	}

	// ── Assemble results ──────────────────────────────────────────────────────
	results := make([]PackageAnalysis, 0, len(pkgs))

	// Build a set of enabled base IDs for dependency resolution
	enabledBase := make(map[string]bool)
	for _, p := range pkgs {
		if p.IsEnabled && !p.IsCorrupt && p.Meta.Creator != "" {
			b := strings.ToLower(p.Meta.Creator + "." + p.Meta.PackageName)
			enabledBase[b] = true
		}
	}

	for _, p := range pkgs {
		a := PackageAnalysis{FilePath: p.FilePath}

		if ob, ok := obsoletePaths[p.FilePath]; ok {
			a.IsDuplicate = true
			a.ObsoletedBy = ob
		}
		if rd, ok := redundantPaths[p.FilePath]; ok {
			a.IsExactDuplicate = true
			if a.ObsoletedBy == "" {
				a.ObsoletedBy = rd
			}
		}
		if exactCounts[exactKey(p)] > 1 {
			a.IsExactDuplicate = true
			if a.ObsoletedBy == "" {
				a.ObsoletedBy = "Identical copy exists in library"
			}
		}

		// Missing dependency detection
		if p.IsEnabled && !p.IsCorrupt && p.Meta.Dependencies != nil {
			for depID := range p.Meta.Dependencies {
				dLower := strings.ToLower(depID)

				// Skip well-known built-in IDs
				if dLower == "everlaster.core.latest" || strings.HasPrefix(dLower, "system.") {
					continue
				}

					if !resolver.resolves(depID) {
						a.MissingDeps = append(a.MissingDeps, depID)
				}
			}
		}

		// Removable detection (no package depends on this one). Enable-agnostic:
		// a disabled package still exists in YAVAM's view.
		if !p.IsCorrupt && p.Meta.Creator != "" {
			myID := strings.ToLower(fmt.Sprintf("%s.%s.%s", p.Meta.Creator, p.Meta.PackageName, p.Meta.Version))
			if !referenced[myID] {
				a.IsRemovable = true
			}
			if deps, ok := reverseDeps[myID]; ok {
				a.ReferencedBy = deps
			}
		}

		results = append(results, a)
	}

	return results
}

// ── Existing service methods (unchanged contract) ─────────────────────────────

// CheckDependencies analyzes packages for missing dependencies.
// This is preserved for backward compatibility; internally it now uses LinkPass.
func (s *defaultLibraryService) CheckDependencies(pkgs []models.VarPackage) []models.VarPackage {
	analyses := LinkPass(pkgs)
	byPath := make(map[string]PackageAnalysis, len(analyses))
	for _, a := range analyses {
		byPath[a.FilePath] = a
	}
	for i := range pkgs {
		if a, ok := byPath[pkgs[i].FilePath]; ok {
			pkgs[i].MissingDeps = a.MissingDeps
		}
	}
	return pkgs
}
