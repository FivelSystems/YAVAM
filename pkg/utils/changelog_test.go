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

func TestExtractChangelogSection_ExactVersionMatch(t *testing.T) {
	got := ExtractChangelogSection(sampleChangelog, "1.3.23")
	want := "### Fixed\n- Stable-only fix."
	if got != want {
		t.Fatalf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestExtractChangelogSection_StripsVPrefixAndPrerelease(t *testing.T) {
	got := ExtractChangelogSection(sampleChangelog, "v1.3.23")
	want := "### Fixed\n- Stable-only fix."
	if got != want {
		t.Fatalf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestExtractChangelogSection_UnstableBuildFallsBackToUnreleased(t *testing.T) {
	got := ExtractChangelogSection(sampleChangelog, "1.4.0-unstable.20261108.abc123")
	want := "### Added\n- Unreleased feature nobody on Stable should see yet."
	if got != want {
		t.Fatalf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestExtractChangelogSection_NeverLeaksUnreleasedToAMatchedStableVersion(t *testing.T) {
	got := ExtractChangelogSection(sampleChangelog, "1.3.23")
	if strings.Contains(got, "Unreleased feature") {
		t.Fatalf("1.3.23 section must not contain Unreleased content, got:\n%s", got)
	}
}

func TestExtractChangelogSection_UnmatchedVersionFallsBackToUnreleased(t *testing.T) {
	got := ExtractChangelogSection(sampleChangelog, "9.9.9")
	want := "### Added\n- Unreleased feature nobody on Stable should see yet."
	if got != want {
		t.Fatalf("got:\n%s\nwant:\n%s", got, want)
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
