package manager

import "yavam/pkg/parser"

// GetThumbnail extracts the thumbnail from a package
func (m *Manager) GetThumbnail(filePath string) ([]byte, error) {
	_, thumbBytes, _, err := parser.ParseVarMetadata(filePath)
	if err != nil {
		return nil, err
	}
	return thumbBytes, nil
}
