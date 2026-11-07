package config

import "strings"

// normaliseAllowedHosts lowercases, trims and de-duplicates the extra Host
// names the server accepts, dropping blanks, so every comparison against the
// list is a plain string match. Entries are bare names without a port.
func normaliseAllowedHosts(hosts []string) []string {
	if len(hosts) == 0 {
		return nil
	}
	seen := make(map[string]bool, len(hosts))
	normalised := make([]string, 0, len(hosts))
	for _, host := range hosts {
		host = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(host)), ".")
		if host == "" || seen[host] {
			continue
		}
		seen[host] = true
		normalised = append(normalised, host)
	}
	if len(normalised) == 0 {
		return nil
	}
	return normalised
}
