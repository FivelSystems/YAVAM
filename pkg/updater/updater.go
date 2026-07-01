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

// Update channels. "stable" tracks published releases; "unstable" tracks the
// bleeding edge (weekly prereleases from main), and always resolves to whatever
// build is newest overall so an unstable user never lags behind stable.
const (
	ChannelStable   = "stable"
	ChannelUnstable = "unstable"
)

const defaultAPIBase = "https://api.github.com/repos/fivelsystems/yavam"

type Release struct {
	TagName    string `json:"tag_name"`
	Body       string `json:"body"`
	Draft      bool   `json:"draft"`
	Prerelease bool   `json:"prerelease"`
	Assets     []struct {
		Name               string `json:"name"`
		BrowserDownloadUrl string `json:"browser_download_url"`
	} `json:"assets"`
}

type UpdateInfo struct {
	Version     string `json:"version"`
	Changelog   string `json:"changelog"`
	DownloadURL string `json:"downloadUrl"`
}

// apiBase returns the GitHub API base URL for this repo. YAVAM_UPDATE_URL
// overrides it (used by the local mock server and tests); it is treated as a
// base onto which "/releases" and "/releases/latest" are appended.
func apiBase() string {
	if env := os.Getenv("YAVAM_UPDATE_URL"); env != "" {
		return strings.TrimRight(env, "/")
	}
	return defaultAPIBase
}

// normalizeChannel maps anything that isn't the unstable channel onto stable,
// so an empty/legacy config value is safely treated as stable.
func normalizeChannel(channel string) string {
	if channel == ChannelUnstable {
		return ChannelUnstable
	}
	return ChannelStable
}

// GetLatestVersion returns update info for the given channel ONLY if the
// channel's head build is strictly newer than currentVersion. Used for the
// routine startup check. Returns (nil, nil) when already up to date.
func GetLatestVersion(currentVersion, channel string) (*UpdateInfo, error) {
	head, err := channelHead(channel)
	if err != nil {
		return nil, err
	}
	if head == nil {
		log.Println("[Updater] No release found for channel", normalizeChannel(channel))
		return nil, nil
	}

	if compareVersions(trimV(head.TagName), trimV(currentVersion)) > 0 {
		log.Printf("[Updater] Update available on %s channel: %s\n", normalizeChannel(channel), head.TagName)
		return toUpdateInfo(head)
	}

	log.Println("[Updater] No update needed.")
	return nil, nil
}

// GetChannelHead returns the newest build on the given channel REGARDLESS of the
// currently installed version. This is what powers a channel switch: moving to
// unstable is usually an upgrade, while moving back to stable is typically a
// downgrade to a lower version — both are valid, deliberate installs.
func GetChannelHead(channel string) (*UpdateInfo, error) {
	head, err := channelHead(channel)
	if err != nil {
		return nil, err
	}
	if head == nil {
		return nil, nil
	}
	return toUpdateInfo(head)
}

// channelHead fetches the newest release for a channel.
//   - stable:   GitHub's /releases/latest (newest non-prerelease, non-draft).
//   - unstable: the newest release by semver across the full /releases list
//     (prereleases included), so unstable is always >= stable.
func channelHead(channel string) (*Release, error) {
	base := apiBase()

	if normalizeChannel(channel) == ChannelUnstable {
		releases, err := fetchReleases(base + "/releases")
		if err != nil {
			return nil, err
		}
		var best *Release
		for i := range releases {
			r := &releases[i]
			if r.Draft {
				continue
			}
			if best == nil || compareVersions(trimV(r.TagName), trimV(best.TagName)) > 0 {
				best = r
			}
		}
		return best, nil
	}

	return fetchRelease(base + "/releases/latest")
}

// toUpdateInfo picks the Windows .exe asset from a release and packages it.
func toUpdateInfo(r *Release) (*UpdateInfo, error) {
	var downloadURL string
	for _, a := range r.Assets {
		if strings.HasSuffix(strings.ToLower(a.Name), ".exe") {
			downloadURL = a.BrowserDownloadUrl
			break
		}
	}
	if downloadURL == "" {
		return nil, fmt.Errorf("no executable found in release %s", r.TagName)
	}
	return &UpdateInfo{
		Version:     r.TagName,
		Changelog:   r.Body,
		DownloadURL: downloadURL,
	}, nil
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────

func fetchRelease(url string) (*Release, error) {
	var r Release
	if err := httpGetJSON(url, &r); err != nil {
		return nil, err
	}
	return &r, nil
}

func fetchReleases(url string) ([]Release, error) {
	var rs []Release
	if err := httpGetJSON(url, &rs); err != nil {
		return nil, err
	}
	return rs, nil
}

func httpGetJSON(url string, target any) error {
	log.Printf("[Updater] GET %s\n", url)
	resp, err := http.Get(url)
	if err != nil {
		log.Printf("[Updater] Network error: %v\n", err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[Updater] HTTP Error: %s\n", resp.Status)
		return fmt.Errorf("failed to fetch release: %s", resp.Status)
	}

	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		log.Printf("[Updater] JSON Decode Error: %v\n", err)
		return err
	}
	return nil
}

// ── Version comparison ─────────────────────────────────────────────────────────

func trimV(v string) string { return strings.TrimPrefix(v, "v") }

// compareVersions compares two version strings using Semantic Versioning 2.0.0
// precedence, including pre-release identifiers. Build metadata ("+...") is
// ignored. Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
//
// This correctly orders unstable builds (e.g. 1.4.0-unstable.20260704.a >
// 1.4.0-unstable.20260627.b) and ranks any pre-release below its final release
// (1.4.0 > 1.4.0-unstable.5).
func compareVersions(v1, v2 string) int {
	v1 = strings.SplitN(v1, "+", 2)[0]
	v2 = strings.SplitN(v2, "+", 2)[0]

	main1, pre1 := splitPrerelease(v1)
	main2, pre2 := splitPrerelease(v2)

	if c := compareNumericParts(main1, main2); c != 0 {
		return c
	}

	// Same X.Y.Z → pre-release precedence (SemVer §11.3/§11.4).
	switch {
	case pre1 == "" && pre2 == "":
		return 0
	case pre1 == "": // full release outranks a pre-release
		return 1
	case pre2 == "":
		return -1
	default:
		return comparePrerelease(pre1, pre2)
	}
}

func splitPrerelease(v string) (main, pre string) {
	if i := strings.IndexByte(v, '-'); i >= 0 {
		return v[:i], v[i+1:]
	}
	return v, ""
}

// compareNumericParts compares dot-separated numeric version cores (X.Y.Z).
func compareNumericParts(a, b string) int {
	ap := strings.Split(a, ".")
	bp := strings.Split(b, ".")
	max := len(ap)
	if len(bp) > max {
		max = len(bp)
	}
	for i := 0; i < max; i++ {
		n1, n2 := 0, 0
		if i < len(ap) {
			n1, _ = strconv.Atoi(ap[i])
		}
		if i < len(bp) {
			n2, _ = strconv.Atoi(bp[i])
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

// comparePrerelease compares two pre-release strings per SemVer §11.4: numeric
// identifiers compared numerically, alphanumerics lexically, numeric < alpha,
// and a larger set of identifiers outranks a smaller one when all else is equal.
func comparePrerelease(a, b string) int {
	ai := strings.Split(a, ".")
	bi := strings.Split(b, ".")
	for i := 0; i < len(ai) && i < len(bi); i++ {
		x, y := ai[i], bi[i]
		if x == y {
			continue
		}
		xn, xErr := strconv.Atoi(x)
		yn, yErr := strconv.Atoi(y)
		switch {
		case xErr == nil && yErr == nil: // both numeric
			if xn > yn {
				return 1
			}
			return -1
		case xErr == nil: // numeric has lower precedence than alphanumeric
			return -1
		case yErr == nil:
			return 1
		default: // both alphanumeric → ASCII order
			if x > y {
				return 1
			}
			return -1
		}
	}
	if len(ai) > len(bi) {
		return 1
	}
	if len(ai) < len(bi) {
		return -1
	}
	return 0
}

// ── Applying updates ───────────────────────────────────────────────────────────

// ApplyUpdate downloads the new version and performs the rename-replace dance.
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
