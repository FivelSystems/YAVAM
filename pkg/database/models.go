package database

// PackageRow mirrors the `packages` table — one row per physical .var file.
//
// The same logical package (PackageKey = "Creator.Name.Version") may appear in
// many rows: across libraries, or within one library at different folders.
// Identity is therefore never a key; the natural key is (LibraryID, RelPath).
//
// ID is assigned by SQLite on insert and is not set by the scanner.
// Note: `categories` and `tags` are stored as JSON arrays in SQLite.
type PackageRow struct {
	ID             int64  // surrogate, DB-assigned; zero when constructing for upsert
	LibraryID      int64  // FK → libraries.id
	RelPath        string // canonical path relative to library root, no ".disabled"
	FileName       string // canonical file name, no ".disabled"
	SizeBytes      int64
	IsEnabled      bool
	IsCorrupt      bool
	PackageKey     string // "Creator.Name.Version" (indexed, NOT unique)
	Family         string // "Creator.Name"
	Creator        string
	PackageName    string
	Version        string
	Description    string
	LicenseType    string
	Type           string
	CategoriesJSON string // JSON: ["Scene","Look"]
	TagsJSON       string // JSON: ["dress","animation"]
	ThumbnailPath  string
	CreationDate   string
	ScannedAt      int64 // Unix timestamp (seconds)
}

// LibraryRow mirrors the `libraries` table.
//
// ID is a stable surrogate key; Path is unique but may change on disk without
// invalidating package references (which point at ID, not Path).
type LibraryRow struct {
	ID                 int64
	Path               string
	Label              string
	PasswordHash       string
	IsPublic           bool
	AllowView          bool
	AllowWrite         bool
	AllowDownload      bool
	AllowBulkDL        bool
	BundleLimitEnabled bool
	BundleMaxPackages  int
	BundleCountDeps    bool
	SortOrder          int
}

// UserMetadataRow mirrors the `user_metadata` table.
type UserMetadataRow struct {
	Family     string // "Creator.Name"
	Rating     int
	IsFavorite bool
	Notes      string
	CustomTags string // JSON array
	UpdatedAt  int64
}

// DependencyRow mirrors the `dependencies` table — one edge per declared
// dependency. Everything is lower-cased. The graph links on FAMILY
// ("Creator.Name"), not the versioned key: VaM dependencies use `.latest` or a
// pinned version that rarely matches the copy actually installed, so reverse
// ("used by") and resolution must be version-agnostic. Whether a dependency is
// satisfied is derived globally at read time (any package of that family
// present), never stored — it would go stale as libraries are added/removed.
type DependencyRow struct {
	DependentKey       string // "creator.name.version" of the declaring package
	DependentFamily    string // "creator.name" of the declaring package
	DependencyDeclared string // raw declared dependency id, e.g. "creator.name.latest"
	DependencyFamily   string // "creator.name" of the dependency (the matching key)
}

// PackageLocation is one physical package resolved to the library that holds it.
// Used to answer "which library has this dependency?" for cross-library navigation.
type PackageLocation struct {
	Family      string
	LibraryPath string
	RelPath     string
	FileName    string
	Creator     string
	PackageName string
	Version     string
	IsEnabled   bool
}

// PocketItemRow mirrors the `pocket_items` table.
type PocketItemRow struct {
	SessionID string
	PackageID int64 // FK → packages.id
	AddedAt   int64
}
