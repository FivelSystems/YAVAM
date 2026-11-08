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

// SetLibraries reorders the configured libraries to match paths. It neither adds
// nor removes libraries and leaves their per-library settings untouched.
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

// RemoveLibrary removes a library and all its associated package records, and
// stops any scan still running on it.
func (m *Manager) RemoveLibrary(path string) error {
	if m.db == nil {
		return fmt.Errorf("database not available")
	}
	if err := m.db.DeleteLibrary(path); err != nil {
		return err
	}
	m.scans.cancelScansOf(path)
	return nil
}
