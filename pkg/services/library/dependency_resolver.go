package library

import (
	"strings"
	"yavam/pkg/models"
)

// DependencyResolver resolves package dependency IDs against a known source.
//
// Implement this interface to support different resolution strategies:
//
//   - LocalResolver (below): checks packages present in the current library scan result.
//
//   - TODO MultiLibraryResolver: check packages across arbitrary library paths on disk.
//     Implement ResolveExact / ResolveBase by walking additional directories and building
//     the same index as LocalResolver, but sourced from external paths.
//
//   - TODO OnlineResolver: query the VaM Hub REST API for package availability.
//     Implement ResolveExact / ResolveBase by issuing an HTTP GET to the Hub search endpoint
//     and caching results in memory for the lifetime of the scan.
//
// To add a new resolver: implement this interface and pass it as an additional argument to
// LinkPass(). Resolvers are tried in the order provided — the first one that returns true wins.
type DependencyResolver interface {
	// ResolveExact returns true if a package with the exact ID "Creator.Name.Version" is available.
	ResolveExact(id string) bool

	// ResolveBase returns true if any version of the package "Creator.Name" is available.
	ResolveBase(baseID string) bool
}

// LocalResolver implements DependencyResolver using the set of packages found during the Hard Pass.
// Build it once, after all packages have been scanned, then pass it to LinkPass.
type LocalResolver struct {
	exact map[string]bool // "creator.name.version" → true
	base  map[string]bool // "creator.name"         → true
}

// NewLocalResolver builds a LocalResolver from a slice of fully-scanned packages.
func NewLocalResolver(pkgs []models.VarPackage) *LocalResolver {
	r := &LocalResolver{
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

func (r *LocalResolver) ResolveExact(id string) bool { return r.exact[strings.ToLower(id)] }
func (r *LocalResolver) ResolveBase(baseID string) bool {
	return r.base[strings.ToLower(baseID)]
}
