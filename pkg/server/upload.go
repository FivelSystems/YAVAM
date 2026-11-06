package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"yavam/pkg/scanner"
	"yavam/pkg/utils"
)

const maxUploadFormBytes = 500 << 20

type uploadItem struct {
	header   *multipart.FileHeader
	fileName string
}

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := r.ParseMultipartForm(maxUploadFormBytes); err != nil {
		s.writeError(w, "File too large", http.StatusBadRequest)
		return
	}

	targetPath := r.FormValue("path")
	if targetPath == "" {
		s.writeError(w, "Target path is required", http.StatusBadRequest)
		return
	}

	if err := s.manager.ValidatePath(targetPath); err != nil {
		s.writeError(w, "Access denied: Invalid library path", http.StatusForbidden)
		return
	}

	headers := r.MultipartForm.File["file"]
	items, status, err := s.vetUploads(targetPath, headers)
	if err != nil {
		s.writeError(w, err.Error(), status)
		return
	}

	count := 0
	for i, item := range items {
		s.Broadcast("scan:progress", map[string]int{"current": i + 1, "total": len(items)})

		err := saveUpload(filepath.Join(targetPath, item.fileName), item.header)
		if errors.Is(err, os.ErrExist) {
			s.writeError(w, fmt.Sprintf("Package already exists in library: %s", item.fileName), http.StatusConflict)
			return
		}
		if err != nil {
			continue
		}
		count++
		s.log(fmt.Sprintf("Uploaded: %s (%d bytes)", item.fileName, item.header.Size))
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"count":   count,
	})
}

// vetUploads checks every file before any is written, so a rejected request
// leaves the library untouched.
func (s *Server) vetUploads(libraryPath string, headers []*multipart.FileHeader) ([]uploadItem, int, error) {
	items := make([]uploadItem, 0, len(headers))
	seenInRequest := make(map[string]bool, len(headers))

	for _, header := range headers {
		fileName := filepath.Base(header.Filename)
		identity, err := checkUploadExtension(fileName)
		if err != nil {
			return nil, http.StatusBadRequest, err
		}
		if seenInRequest[identity] {
			return nil, http.StatusConflict, fmt.Errorf("Duplicate package in request: %s", fileName)
		}
		seenInRequest[identity] = true

		if err := checkNotInLibrary(libraryPath, identity); errors.Is(err, errPackageExists) {
			return nil, http.StatusConflict, fmt.Errorf("Package already exists in library: %s", fileName)
		} else if err != nil {
			return nil, http.StatusInternalServerError, errors.New("Could not inspect target library")
		}
		items = append(items, uploadItem{header: header, fileName: fileName})
	}
	return items, http.StatusOK, nil
}

// checkUploadExtension is the upload allow-list: only .var and .var.disabled
// (case-insensitive). It returns the package identity of the accepted name.
func checkUploadExtension(fileName string) (identity string, err error) {
	identity, ok := utils.PackageIdentity(fileName)
	if !ok {
		return "", fmt.Errorf("Only %s and %s files can be uploaded", utils.EnabledPackageSuffix, utils.DisabledPackageSuffix)
	}
	return identity, nil
}

var errPackageExists = errors.New("package already exists")

// checkNotInLibrary rejects an upload whose package identity already exists in
// the target library, in either enabled or disabled form. It searches the
// library recursively, matching how libraries are scanned.
func checkNotInLibrary(libraryPath, identity string) error {
	existing, err := scanner.NewScanner().ScanForPackages(libraryPath)
	if err != nil {
		return err
	}
	for _, pkg := range existing {
		if existingIdentity, ok := utils.PackageIdentity(pkg.FileName); ok && existingIdentity == identity {
			return errPackageExists
		}
	}
	return nil
}

// saveUpload creates the destination exclusively and removes it again if the
// copy fails, so no partial file is left behind.
func saveUpload(destinationPath string, header *multipart.FileHeader) error {
	src, err := header.Open()
	if err != nil {
		return err
	}
	defer src.Close()

	dst, err := os.OpenFile(destinationPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}

	_, copyErr := io.Copy(dst, src)
	closeErr := dst.Close()
	if err := errors.Join(copyErr, closeErr); err != nil {
		os.Remove(destinationPath)
		return err
	}
	return nil
}
