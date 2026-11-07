package utils

import (
	"strings"
	"testing"
)

const sampleChangelog = `# Changelog

## [1.3.23] - 2026-11-07

### Fixed
- Stable-only fix.

## [Unreleased]

### Added
- Unreleased feature nobody on Stable should see yet.

## [1.3.19] - 2026-05-14

### Added
- Old feature.
`

func TestExtractChangelogSection_ExactVersionMatchIncludesOlderHistory(t *testing.T) {
	got := ExtractChangelogSection(sampleChangelog, "1.3.23")
	want := strings.TrimSpace(`## [1.3.23] - 2026-11-07

### Fixed
- Stable-only fix.

## [Unreleased]

### Added
- Unreleased feature nobody on Stable should see yet.

## [1.3.19] - 2026-05-14

### Added
- Old feature.`)
	if got != want {
		t.Fatalf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestExtractChangelogSection_StripsVPrefixAndPrerelease(t *testing.T) {
	got := ExtractChangelogSection(sampleChangelog, "v1.3.23")
	if !strings.HasPrefix(got, "## [1.3.23]") {
		t.Fatalf("expected the match to start at 1.3.23's own heading, got:\n%s", got)
	}
}

func TestExtractChangelogSection_NeverLeaksContentAboveTheMatchedVersion(t *testing.T) {
	// A changelog where Unreleased sits ABOVE the running version, as it does
	// on main/a release branch cut from main — the running version's notes
	// (and everything older) must never include Unreleased.
	const withUnreleasedOnTop = `# Changelog

## [Unreleased]

### Added
- Future feature not in this build.

## [1.3.24] - 2026-11-07

### Fixed
- The actual fix shipped in this build.

## [1.3.23] - 2026-11-07

### Fixed
- An older, already-shipped fix.
`
	got := ExtractChangelogSection(withUnreleasedOnTop, "1.3.24")
	if strings.Contains(got, "Future feature") {
		t.Fatalf("1.3.24 must not contain Unreleased content, got:\n%s", got)
	}
	if !strings.Contains(got, "The actual fix shipped in this build") {
		t.Fatalf("1.3.24 must contain its own notes, got:\n%s", got)
	}
	if !strings.Contains(got, "An older, already-shipped fix") {
		t.Fatalf("1.3.24 must still include older, already-shipped history, got:\n%s", got)
	}
}

func TestExtractChangelogSection_UnstableBuildFallsBackToUnreleasedPlusHistory(t *testing.T) {
	got := ExtractChangelogSection(sampleChangelog, "1.4.0-unstable.20261108.abc123")
	if !strings.HasPrefix(got, "## [Unreleased]") {
		t.Fatalf("expected an unstable build to start at Unreleased, got:\n%s", got)
	}
	if !strings.Contains(got, "Old feature") {
		t.Fatalf("expected older shipped history to still be included, got:\n%s", got)
	}
}

func TestExtractChangelogSection_UnmatchedVersionFallsBackToUnreleased(t *testing.T) {
	got := ExtractChangelogSection(sampleChangelog, "9.9.9")
	if !strings.HasPrefix(got, "## [Unreleased]") {
		t.Fatalf("got:\n%s", got)
	}
}

func TestExtractChangelogSection_NoMatchAtAllFallsBackToWholeChangelog(t *testing.T) {
	const noUnreleasedChangelog = `# Changelog

## [1.3.19] - 2026-05-14

### Added
- Old feature.
`
	got := ExtractChangelogSection(noUnreleasedChangelog, "9.9.9")
	if got != noUnreleasedChangelog {
		t.Fatalf("expected the untouched changelog as a last resort, got:\n%s", got)
	}
}
