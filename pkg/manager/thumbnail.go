package manager

// GetThumbnail returns a package's thumbnail, served through the thumbnail cache.
func (m *Manager) GetThumbnail(filePath string) ([]byte, error) {
	if err := m.ValidatePath(filePath); err != nil {
		return nil, err
	}
	return m.library.GetThumbnail(filePath)
}
