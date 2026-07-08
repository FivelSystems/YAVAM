package models

type MetaJSON struct {
	Creator      string                 `json:"creator"`
	CreatorName  string                 `json:"creatorName,omitempty"` // Alternative to creator
	PackageName  string                 `json:"packageName"`
	Version      string                 `json:"version"`
	Description  string                 `json:"description,omitempty"`
	LicenseType  string                 `json:"licenseType,omitempty"` // e.g. "CC BY", "PC", "PC EA"
	Dependencies map[string]interface{} `json:"dependencies,omitempty"`
	ContentList  []string               `json:"contentList,omitempty"`
	Tags         []string               `json:"tags,omitempty"`
	ImageUrl     string                 `json:"imageUrl,omitempty"`
}

type VarPackage struct {
	FilePath        string   `json:"filePath"`
	FileName        string   `json:"fileName"`
	Size            int64    `json:"size"`
	Meta            MetaJSON `json:"meta"`
	ThumbnailPath   string   `json:"thumbnailPath"` // Path to extracted cached thumbnail
	ThumbnailBase64 string   `json:"thumbnailBase64"`
	IsEnabled       bool     `json:"isEnabled"`
	HasThumbnail    bool     `json:"hasThumbnail"`
	MissingDeps     []string `json:"missingDeps"`
	IsDuplicate     bool     `json:"isDuplicate"`
	IsFavorite      bool     `json:"isFavorite"`
	Rating          int      `json:"rating"` // 0–5 stars, keyed by family in user_metadata (0 = unrated)
	IsHidden        bool     `json:"isHidden"`
	IsRemovable     bool     `json:"isRemovable"`     // true = no other package depends on this one, so removing it breaks nothing
	IsExactDuplicate bool    `json:"isExactDuplicate"` // true = same version+size exists at another path
	ReferencedBy    []string `json:"referencedBy,omitempty"` // families that depend on this package
	ObsoletedBy     string   `json:"obsoletedBy,omitempty"`  // reason this copy is obsolete/redundant
	LicenseType     string   `json:"licenseType"`     // propagated from Meta.LicenseType after scan
	Type            string   `json:"type"`
	Categories      []string `json:"categories"`
	Tags            []string `json:"tags,omitempty"`
	CreationDate    string   `json:"creationDate"` // ISO 8601
	IsCorrupt       bool     `json:"isCorrupt"`
}

type PackageContent struct {
	FilePath        string `json:"filePath"`
	FileName        string `json:"fileName"`
	Type            string `json:"type"`
	ThumbnailBase64 string `json:"thumbnailBase64,omitempty"`
	Size            int64  `json:"size"`
}

type ScanResult struct {
	Packages []VarPackage `json:"packages"`
	Tags     []string     `json:"tags"`
}

// ResolveConflictResult holds statistics about the resolution operation
type ResolveConflictResult struct {
	Merged   int    `json:"merged"`
	Disabled int    `json:"disabled"`
	NewPath  string `json:"newPath"`
}

// BulkDeleteResult reports the outcome for a single file in a bulk delete operation.
type BulkDeleteResult struct {
	FilePath string `json:"filePath"`
	Success  bool   `json:"success"`
	Error    string `json:"error,omitempty"`
}

// FileDetail represents basic file information for UI display
type FileDetail struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
	Path string `json:"path"`
}

// DependencyLocation tells the UI which library holds a dependency (or dependent),
// so a cross-library entry in the details panel can be labelled and clicked to
// jump to that library. Found is false when no library contains the family.
type DependencyLocation struct {
	Query        string `json:"query"`        // the id/family that was asked about
	Found        bool   `json:"found"`
	LibraryPath  string `json:"libraryPath"`  // library holding it ("" if not found)
	LibraryLabel string `json:"libraryLabel"` // display name for the label
	FilePath     string `json:"filePath"`     // absolute path to select on jump
	PackageName  string `json:"packageName"`
	Creator      string `json:"creator"`
	Version      string `json:"version"`
	IsEnabled    bool   `json:"isEnabled"`
}
