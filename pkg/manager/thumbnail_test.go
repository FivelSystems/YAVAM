package manager

import (
	"bytes"
	"errors"
	"path/filepath"
	"testing"
	"yavam/pkg/services/library"
)

type stubThumbnailLibrary struct {
	library.LibraryService
	requested []string
	thumbnail []byte
}

func (s *stubThumbnailLibrary) GetThumbnail(pkgPath string) ([]byte, error) {
	s.requested = append(s.requested, pkgPath)
	return s.thumbnail, nil
}

func TestGetThumbnailDelegatesToLibraryService(t *testing.T) {
	m, _, libraryDir, _ := newManagerWithLibrary(t)
	stub := &stubThumbnailLibrary{thumbnail: []byte("thumb")}
	m.library = stub
	inside := filepath.Join(libraryDir, "a.var")

	got, err := m.GetThumbnail(inside)
	if err != nil {
		t.Fatalf("GetThumbnail: %v", err)
	}
	if !bytes.Equal(got, stub.thumbnail) {
		t.Fatalf("unexpected bytes %q", got)
	}
	if len(stub.requested) != 1 || stub.requested[0] != inside {
		t.Fatalf("library service not asked for %s: %v", inside, stub.requested)
	}
}

func TestGetThumbnailRejectsPathOutsideLibraries(t *testing.T) {
	m, _, _, outsideDir := newManagerWithLibrary(t)
	stub := &stubThumbnailLibrary{}
	m.library = stub

	_, err := m.GetThumbnail(filepath.Join(outsideDir, "b.var"))
	if !errors.Is(err, ErrPathNotAllowed) {
		t.Fatalf("expected ErrPathNotAllowed, got %v", err)
	}
	if len(stub.requested) != 0 {
		t.Fatalf("library service reached for rejected path: %v", stub.requested)
	}
}
