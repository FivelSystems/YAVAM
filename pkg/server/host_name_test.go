package server

import (
	"testing"
	"yavam/pkg/services/config"
)

func TestHostNameOf_AcceptsLegitimateForms(t *testing.T) {
	cases := map[string]string{
		"127.0.0.1":             "127.0.0.1",
		"127.0.0.1:8080":        "127.0.0.1",
		"[::1]":                 "::1",
		"[::1]:8080":            "::1",
		"[2001:DB8::1]:65535":   "2001:db8::1",
		"localhost":             "localhost",
		"LocalHost:1":           "localhost",
		"localhost.":            "localhost",
		"localhost.:8080":       "localhost",
		"studio-rig":            "studio-rig",
		"Studio-Rig.local:8080": "studio-rig.local",
		"yavam.home.lan":        "yavam.home.lan",
	}
	for input, want := range cases {
		if got := hostNameOf(input); got != want {
			t.Errorf("hostNameOf(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestHostNameOf_RejectsMalformedValues(t *testing.T) {
	rejected := []string{
		"",
		"127.0.0.1:x@evil.com",
		"user@127.0.0.1",
		"127.0.0.1@evil.com:80",
		"[[::1]]",
		"[[::1]]:8080",
		"[::1]]",
		"[::1",
		"::1]",
		"[::1]x",
		"[::1]:",
		"[::1]:abc",
		"[127.0.0.1]",
		"[localhost]:80",
		"[]",
		"::1",
		"fe80::1%eth0",
		"[fe80::1%25eth0]",
		"localhost:",
		"localhost:abc",
		"localhost:0",
		"localhost:65536",
		"localhost:-1",
		"localhost:+80",
		"localhost:080000",
		"localhost:80:80",
		":8080",
		".",
		".:80",
		"local host",
		"localhost\t",
		" localhost",
		"localhost ",
		"localhost/path",
		`localhost\evil`,
		"local\x00host",
		"local\r\nhost",
		"local\x7fhost",
	}
	for _, input := range rejected {
		if got := hostNameOf(input); got != "" {
			t.Errorf("hostNameOf(%q) = %q, want it refused", input, got)
		}
	}
}

func TestMalformedHostIsNeverLoopbackOrAllowed(t *testing.T) {
	s := newHostGuardServer(t, &config.Config{})
	for _, host := range []string{"127.0.0.1:x@evil.com", "[[::1]]", "localhost:abc"} {
		if isLocalHostName(hostNameOf(host)) {
			t.Errorf("%q classified as local", host)
		}
		if s.hostAllowed(hostNameOf(host)) {
			t.Errorf("%q passed the host guard", host)
		}
	}
}
