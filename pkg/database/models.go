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

// DependencyRow mirrors the `dependencies` table.
type DependencyRow struct {
	DependentKey  string // "Creator.Name.Version"
	DependencyKey string // "Creator.Name.Version"
	IsResolved    bool
}

// PocketItemRow mirrors the `pocket_items` table.
type PocketItemRow struct {
	SessionID string
	PackageID int64 // FK → packages.id
	AddedAt   int64
}
