package library

import (
	"varmanager/pkg/fs"
	"varmanager/pkg/scanner"
	"varmanager/pkg/services/system"
)

type defaultLibraryService struct {
	scanner *scanner.Scanner
	system  system.SystemService
	fs      fs.FileSystem

	// Caches?
	// Manager didn't persist cache in memory beyond what was returned?
	// It returned counts on demand using scanner.
}

func NewLibraryService(sys system.SystemService, fileSystem fs.FileSystem) LibraryService {
	if fileSystem == nil {
		fileSystem = &fs.WindowsFileSystem{}
	}
	return &defaultLibraryService{
		scanner: scanner.NewScanner(),
		system:  sys,
		fs:      fileSystem,
	}
}
