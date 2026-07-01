package manager

import (
	"fmt"
	"log"
)

// Library CRUD — all operations delegate to the SQLite DB.
// The config.json libraries array was zeroed out during the migration in
// NewManager and is no longer written to or read from for library management.

// GetLibraries returns the list of configured library paths, ordered by sort_order.
// Falls back gracefully if the DB is unavailable.
func (m *Manager) GetLibraries() []string {
	if m.db == nil {
		return []string{}
	}
	paths, err := m.db.GetLibraryPaths()
	if err != nil {
		log.Printf("[Manager] GetLibraries DB error: %v", err)
		return []string{}
	}
	if paths == nil {
		return []string{}
	}
	return paths
}

// SetLibraries replaces the entire library list in the DB with the given paths,
// preserving any existing per-library settings (label, permissions, etc.).
// Paths not in the new list are removed. This is used for reordering.
func (m *Manager) SetLibraries(paths []string) error {
	if m.db == nil {
		return fmt.Errorf("database not available")
	}
	return m.db.SetLibraryOrder(paths)
}

// AddLibrary adds a library path with default permissions if it does not already exist.
func (m *Manager) AddLibrary(path string) error {
	if m.db == nil {
		return fmt.Errorf("database not available")
	}
	return m.db.UpsertLibrary(path)
}

// RemoveLibrary removes a library and all its associated package records.
func (m *Manager) RemoveLibrary(path string) error {
	if m.db == nil {
		return fmt.Errorf("database not available")
	}
	return m.db.DeleteLibrary(path)
}
