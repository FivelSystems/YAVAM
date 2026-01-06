package models

type MetaJSON struct {
	Creator      string                 `json:"creator"`
	PackageName  string                 `json:"packageName"`
	Version      string                 `json:"version"`
	Description  string                 `json:"description,omitempty"`
	Dependencies map[string]interface{} `json:"dependencies,omitempty"`
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
}
