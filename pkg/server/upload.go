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

const (
	maxUploadRequestBytes    = 2 << 30
	uploadMemoryThreshold    = 32 << 20
	maxUploadFilesPerRequest = 200
)

type uploadItem struct {
	header   *multipart.FileHeader
	fileName string
}

// Package-level variables are test seams: tests lower the request limit and
// inject write failures.
var (
	uploadRequestLimit int64 = maxUploadRequestBytes
	saveUploadFile           = saveUpload
)

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, uploadRequestLimit)
	if err := r.ParseMultipartForm(uploadMemoryThreshold); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			s.writeError(w, "Upload exceeds the maximum request size", http.StatusRequestEntityTooLarge)
			return
		}
		s.writeError(w, "Invalid upload request", http.StatusBadRequest)
		return
	}
	defer r.MultipartForm.RemoveAll()

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
	if len(headers) > maxUploadFilesPerRequest {
		s.writeError(w, fmt.Sprintf("Too many files in one request (maximum %d)", maxUploadFilesPerRequest), http.StatusRequestEntityTooLarge)
		return
	}
	items, status, err := s.vetUploads(targetPath, headers)
	if err != nil {
		s.writeError(w, err.Error(), status)
		return
	}

	created := make([]string, 0, len(items))
	for i, item := range items {
		s.Broadcast("scan:progress", map[string]int{"current": i + 1, "total": len(items)})

		destination := filepath.Join(targetPath, item.fileName)
		err := saveUploadFile(destination, item.header)
		if errors.Is(err, os.ErrExist) {
			removeAll(created)
			s.writeError(w, fmt.Sprintf("Package already exists in library: %s", item.fileName), http.StatusConflict)
			return
		}
		if err != nil {
			removeAll(created)
			s.log(fmt.Sprintf("Upload failed for %s: %s", utils.SanitizeForLog(item.fileName), utils.SanitizeForLog(err.Error())))
			s.writeError(w, "Could not save package", http.StatusInternalServerError)
			return
		}
		created = append(created, destination)
		s.log(fmt.Sprintf("Uploaded: %s (%d bytes)", utils.SanitizeForLog(item.fileName), item.header.Size))
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"count":   len(created),
	})
}

// removeAll is best effort: it is only used to undo files this request created.
func removeAll(paths []string) {
	for _, path := range paths {
		os.Remove(path)
	}
}

// vetUploads checks every file before any is written, so a rejected request
// leaves the library untouched. The library is scanned once per request.
func (s *Server) vetUploads(libraryPath string, headers []*multipart.FileHeader) ([]uploadItem, int, error) {
	items := make([]uploadItem, 0, len(headers))
	identities := make([]string, 0, len(headers))
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
		identities = append(identities, identity)
		items = append(items, uploadItem{header: header, fileName: fileName})
	}
	if len(items) == 0 {
		return items, http.StatusOK, nil
	}

	existing, err := libraryIdentities(libraryPath)
	if err != nil {
		return nil, http.StatusInternalServerError, errors.New("Could not inspect target library")
	}
	for i, identity := range identities {
		if existing[identity] {
			return nil, http.StatusConflict, fmt.Errorf("Package already exists in library: %s", items[i].fileName)
		}
	}
	return items, http.StatusOK, nil
}

// checkUploadExtension is the upload allow-list: only .var and .var.disabled
// (case-insensitive), with a name that is safe to create. It returns the
// package identity of the accepted name.
func checkUploadExtension(fileName string) (identity string, err error) {
	identity, ok := utils.PackageIdentity(fileName)
	if !ok {
		return "", fmt.Errorf("Only %s and %s files can be uploaded", utils.EnabledPackageSuffix, utils.DisabledPackageSuffix)
	}
	if err := utils.ValidateUploadFileName(fileName); err != nil {
		return "", errors.New("Package file name contains characters or names that are not allowed")
	}
	return identity, nil
}

// libraryIdentities returns the identities of every package in the library, in
// enabled or disabled form. It searches recursively, matching how libraries are
// scanned.
func libraryIdentities(libraryPath string) (map[string]bool, error) {
	existing, err := scanner.NewScanner().ScanForPackages(libraryPath)
	if err != nil {
		return nil, err
	}
	identities := make(map[string]bool, len(existing))
	for _, pkg := range existing {
		if identity, ok := utils.PackageIdentity(pkg.FileName); ok {
			identities[identity] = true
		}
	}
	return identities, nil
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
