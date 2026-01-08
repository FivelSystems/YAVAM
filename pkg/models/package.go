package models

type MetaJSON struct {
	Creator      string                 `json:"creator"`
	PackageName  string                 `json:"packageName"`
	Version      string                 `json:"version"`
	Description  string                 `json:"description,omitempty"`
	Dependencies map[string]interface{} `json:"dependencies,omitempty"`
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
	IsHidden        bool     `json:"isHidden"`
	Type            string   `json:"type"`
	Categories      []string `json:"categories"`
	Tags            []string `json:"tags,omitempty"`
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
