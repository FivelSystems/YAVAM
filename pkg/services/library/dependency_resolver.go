package library

import (
	"strings"
	"yavam/pkg/models"
)

// localResolver answers whether a dependency id is satisfied by the packages
// of a single library scan.
type localResolver struct {
	exact map[string]bool // "creator.name.version" → true
	base  map[string]bool // "creator.name"         → true
}

func newLocalResolver(pkgs []models.VarPackage) *localResolver {
	r := &localResolver{
		exact: make(map[string]bool, len(pkgs)),
		base:  make(map[string]bool, len(pkgs)),
	}
	for _, p := range pkgs {
		if p.IsCorrupt || p.Meta.Creator == "" || p.Meta.PackageName == "" {
			continue
		}
		id := strings.ToLower(p.Meta.Creator + "." + p.Meta.PackageName + "." + p.Meta.Version)
		base := strings.ToLower(p.Meta.Creator + "." + p.Meta.PackageName)
		r.exact[id] = true
		r.base[base] = true
	}
	return r
}

func (r *localResolver) resolveExact(id string) bool { return r.exact[strings.ToLower(id)] }

func (r *localResolver) resolveBase(baseID string) bool { return r.base[strings.ToLower(baseID)] }

// resolves reports whether depID is satisfied by an exact id, a ".latest" alias,
// or any version of the package (progressively stripping trailing segments to
// handle multi-dot package names).
func (r *localResolver) resolves(depID string) bool {
	if r.resolveExact(depID) || r.resolveBase(depID) {
		return true
	}
	lower := strings.ToLower(depID)
	if base, isLatest := strings.CutSuffix(lower, ".latest"); isLatest && r.resolveBase(base) {
		return true
	}
	for candidate := lower; strings.Contains(candidate, "."); {
		candidate = candidate[:strings.LastIndex(candidate, ".")]
		if r.resolveBase(candidate) {
			return true
		}
	}
	return false
}
