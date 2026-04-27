package parser

import "strings"

// categoryRule maps a normalised folder prefix to a canonical category name.
// Order matters: more-specific prefixes MUST appear before broader ones so
// that e.g. "custom/atom/person/morphs/" is tested before "custom/atom/".
type categoryRule struct {
	prefix   string
	category string
}

// categoryRules is the single source of truth for physical categorisation.
// Based on VaM's directory conventions, cross-referenced with
// perfectbloo/PackageVault (EPackageCategory.cs) and the VaM Hub taxonomy.
// To add a new category: append one line here. Nothing else needs changing.
var categoryRules = []categoryRule{
	// ── Saves ─────────────────────────────────────────────────────────────
	{prefix: "saves/scene/", category: "Scene"},
	{prefix: "saves/person/appearance/", category: "Look"},
	{prefix: "saves/person/pose/", category: "Pose"},

	// ── Custom/Atom (person-scoped, most specific first) ──────────────────
	{prefix: "custom/atom/person/appearance/", category: "Look"},
	{prefix: "custom/atom/person/morphs/", category: "Morph"},
	{prefix: "custom/atom/person/textures/", category: "Skin"},

	// ── Custom (top-level content folders) ────────────────────────────────
	{prefix: "custom/clothing/", category: "Clothing"},
	{prefix: "custom/hair/", category: "Hair"},
	{prefix: "custom/scripts/", category: "Plugin"},
	{prefix: "custom/assets/", category: "Asset"},
	{prefix: "custom/sounds/", category: "Sound"},
	{prefix: "custom/images/", category: "Image"},
	{prefix: "custom/subscene/", category: "SubScene"},
	{prefix: "custom/pluginpresets/", category: "PluginPreset"},

	// ── Niche / plugin-specific ────────────────────────────────────────────
	{prefix: "saves/plugindata/blooprints/", category: "Blueprint"},
}

// classifyPath returns the canonical category for a normalised path
// (lowercased, forward-slashes), or an empty string if no rule matches.
func classifyPath(normPath string) string {
	for _, rule := range categoryRules {
		if strings.HasPrefix(normPath, rule.prefix) {
			return rule.category
		}
	}
	return ""
}
