package updater

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Release struct {
	TagName string `json:"tag_name"`
	Body    string `json:"body"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadUrl string `json:"browser_download_url"`
	} `json:"assets"`
}

type UpdateInfo struct {
	Version     string `json:"version"`
	Changelog   string `json:"changelog"`
	DownloadURL string `json:"downloadUrl"`
}

// GetLatestVersion checks GitHub for a newer version
func GetLatestVersion(currentVersion string) (*UpdateInfo, error) {
	url := "https://api.github.com/repos/fivelsystems/yavam/releases/latest"
	if envUrl := os.Getenv("YAVAM_UPDATE_URL"); envUrl != "" {
		url = envUrl
	}
	log.Printf("[Updater] Checking for updates at: %s\n", url)
	resp, err := http.Get(url)
	if err != nil {
		log.Printf("[Updater] Network error: %v\n", err)
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[Updater] HTTP Error: %s\n", resp.Status)
		return nil, fmt.Errorf("failed to fetch release: %s", resp.Status)
	}

	var rel Release
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		log.Printf("[Updater] JSON Decode Error: %v\n", err)
		return nil, err
	}

	// Clean versions (remove 'v' prefix)
	remoteVer := strings.TrimPrefix(rel.TagName, "v")
	localVer := strings.TrimPrefix(currentVersion, "v")

	log.Printf("[Updater] Comparing Local: %s vs Remote: %s\n", localVer, remoteVer)

	// Compare
	if compareVersions(remoteVer, localVer) > 0 {
		log.Println("[Updater] Update available!")
		// Find .exe asset
		var downloadUrl string
		for _, a := range rel.Assets {
			if strings.HasSuffix(strings.ToLower(a.Name), ".exe") {
				downloadUrl = a.BrowserDownloadUrl
				break
			}
		}
		if downloadUrl == "" {
			log.Println("[Updater] No .exe asset found.")
			return nil, fmt.Errorf("no executable found in release")
		}

		return &UpdateInfo{
			Version:     rel.TagName,
			Changelog:   rel.Body,
			DownloadURL: downloadUrl,
		}, nil
	} else {
		log.Println("[Updater] No update needed.")
	}

	return nil, nil // No update
}

// Result: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
func compareVersions(v1, v2 string) int {
	// Simple Semantic Versioning parser (Major.Minor.Patch)
	// Ignores pre-release suffixes for now (e.g. -e)
	v1Parts := strings.Split(strings.Split(v1, "-")[0], ".")
	v2Parts := strings.Split(strings.Split(v2, "-")[0], ".")

	maxLen := len(v1Parts)
	if len(v2Parts) > maxLen {
		maxLen = len(v2Parts)
	}

	for i := 0; i < maxLen; i++ {
		n1 := 0
		if i < len(v1Parts) {
			n1, _ = strconv.Atoi(v1Parts[i])
		}
		n2 := 0
		if i < len(v2Parts) {
			n2, _ = strconv.Atoi(v2Parts[i])
		}

		if n1 > n2 {
			return 1
		}
		if n1 < n2 {
			return -1
		}
	}
	return 0
}

// ApplyUpdate downloads the new version and performs the rename-replace dance
func ApplyUpdate(downloadUrl string) error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	return applyUpdateTo(downloadUrl, executable)
}

func applyUpdateTo(downloadUrl, targetPath string) error {
	// 1. Download to .new file
	newFile := targetPath + ".new"
	resp, err := http.Get(downloadUrl)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	out, err := os.Create(newFile)
	if err != nil {
		return err
	}

	_, err = io.Copy(out, resp.Body)
	out.Close()
	if err != nil {
		return err
	}

	// 2. Rename current to .old
	// Note: Windows allows renaming a running executable!
	oldFile := filepath.Join(filepath.Dir(targetPath), filepath.Base(targetPath)+".old")

	// Ensure old doesn't exist (from previous failed update?)
	os.Remove(oldFile)

	if err := os.Rename(targetPath, oldFile); err != nil {
		return fmt.Errorf("failed to rename current exe: %w", err)
	}

	// 3. Rename .new to current
	if err := os.Rename(newFile, targetPath); err != nil {
		// Try to restore
		os.Rename(oldFile, targetPath)
		return fmt.Errorf("failed to install new exe: %w", err)
	}

	return nil
}

// CleanupOld removes the .old file from a previous update
func CleanupOld() {
	executable, err := os.Executable()
	if err != nil {
		return
	}
	oldFile := filepath.Join(filepath.Dir(executable), filepath.Base(executable)+".old")

	// Run in background, give it a moment in case filesystem is sluggish
	go func() {
		time.Sleep(2 * time.Second)
		os.Remove(oldFile)
	}()
}
