package utils

import (
	"regexp"
	"strings"
)

var changelogHeadingPattern = regexp.MustCompile(`(?m)^## \[([^\]]+)\]`)

// ExtractChangelogSection returns the given app's "What's New" notes from a
// Keep a Changelog document: everything from the "## [<version>]" heading
// matching that version through the end of the file, so a user who skipped
// several releases still sees everything they missed, not just the latest
// one. Only the bracketed version is matched (trailing date/text on the
// heading line is ignored), and a leading "v" plus any "-prerelease" suffix
// (e.g. an Unstable build's "1.4.0-unstable.20261108.abc123") are stripped
// before comparing.
//
// What it must never do is include anything ABOVE that heading — on `main`,
// that's the "## [Unreleased]" section (and, if newer tagged sections exist
// above the running version for any reason, those too), none of which has
// shipped in this build yet.
//
// If no heading matches the version — the normal case for an Unstable build,
// whose version was never given its own heading — it falls back to
// "## [Unreleased]" (which, for that build, legitimately has shipped). If
// neither is found, the whole changelog is returned unchanged so callers
// never see an empty result.
func ExtractChangelogSection(changelog, version string) string {
	headings := findChangelogHeadings(changelog)

	target := normalizeChangelogVersion(version)
	if start, ok := headings[target]; ok {
		return strings.TrimSpace(changelog[start:])
	}
	if start, ok := headings["unreleased"]; ok {
		return strings.TrimSpace(changelog[start:])
	}
	return changelog
}

func normalizeChangelogVersion(version string) string {
	version = strings.TrimPrefix(strings.TrimSpace(version), "v")
	if i := strings.Index(version, "-"); i != -1 {
		version = version[:i]
	}
	return strings.ToLower(version)
}

// findChangelogHeadings maps each lowercased "## [...]" heading to the byte
// offset where that heading's own line begins.
func findChangelogHeadings(changelog string) map[string]int {
	matches := changelogHeadingPattern.FindAllStringSubmatchIndex(changelog, -1)
	headings := make(map[string]int, len(matches))

	for _, m := range matches {
		key := normalizeChangelogVersion(changelog[m[2]:m[3]])
		if _, exists := headings[key]; !exists {
			headings[key] = m[0]
		}
	}

	return headings
}
