package utils

import (
	"regexp"
	"strings"
)

var changelogHeadingPattern = regexp.MustCompile(`(?m)^## \[([^\]]+)\]`)

// ExtractChangelogSection returns the body of the "## [<version>]" section
// from a Keep a Changelog document, for the given app version. Only the
// bracketed version is matched (trailing date/text on the heading line is
// ignored), and a leading "v" plus any "-prerelease" suffix (e.g. an Unstable
// build's "1.4.0-unstable.20261108.abc123") are stripped before comparing.
//
// If no section matches that version — the normal case for an Unstable build,
// whose version was never given its own heading — it falls back to
// "## [Unreleased]". If neither is found, the whole changelog is returned
// unchanged so callers never see an empty result.
func ExtractChangelogSection(changelog, version string) string {
	sections := splitChangelogSections(changelog)

	target := normalizeChangelogVersion(version)
	if body, ok := sections[target]; ok {
		return body
	}
	if body, ok := sections["unreleased"]; ok {
		return body
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

// splitChangelogSections maps each lowercased "## [...]" heading to the
// markdown body that follows it, up to the next such heading.
func splitChangelogSections(changelog string) map[string]string {
	matches := changelogHeadingPattern.FindAllStringSubmatchIndex(changelog, -1)
	sections := make(map[string]string, len(matches))

	for i, m := range matches {
		headingEnd := m[1]
		bodyStart := strings.IndexByte(changelog[headingEnd:], '\n')
		if bodyStart == -1 {
			bodyStart = len(changelog)
		} else {
			bodyStart += headingEnd + 1
		}

		bodyEnd := len(changelog)
		if i+1 < len(matches) {
			bodyEnd = matches[i+1][0]
		}

		key := normalizeChangelogVersion(changelog[m[2]:m[3]])
		sections[key] = strings.TrimSpace(changelog[bodyStart:bodyEnd])
	}

	return sections
}
