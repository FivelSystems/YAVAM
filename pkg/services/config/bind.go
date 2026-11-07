package config

import (
	"errors"
	"net"
)

const (
	// BindAll listens on every interface; an empty value means the same.
	BindAll = "all"

	// BindLoopback listens on the local machine only.
	BindLoopback = "loopback"

	allInterfacesHost = "0.0.0.0"
	loopbackHost      = "127.0.0.1"
)

// ErrInvalidBindAddress rejects anything that is not a keyword or the IP of a local interface.
var ErrInvalidBindAddress = errors.New(`bind address must be "", "all", "loopback" or the IP of a local network interface`)

// ValidateBindAddress accepts "", "all", "loopback" or an IP that currently
// belongs to a local interface. Hostnames and free-form text are rejected so a
// typo can never silently widen or redirect the listener.
func ValidateBindAddress(value string) error {
	switch value {
	case "", BindAll, BindLoopback:
		return nil
	}

	ip := net.ParseIP(value)
	if ip == nil {
		return ErrInvalidBindAddress
	}
	if !isLocalInterfaceIP(ip) {
		return ErrInvalidBindAddress
	}
	return nil
}

// ResolveBindHost turns a validated bind value into the host handed to the listener.
func ResolveBindHost(value string) string {
	switch value {
	case "", BindAll:
		return allInterfacesHost
	case BindLoopback:
		return loopbackHost
	default:
		return value
	}
}

// normaliseBindAddress replaces an invalid value with BindLoopback. Failing
// closed matters here: a stale interface IP (for example after a DHCP change)
// falling back to "all" would silently expose the server on every network,
// while loopback only costs the user a visible, fixable setting.
func normaliseBindAddress(value string) string {
	if ValidateBindAddress(value) != nil {
		return BindLoopback
	}
	return value
}

func isLocalInterfaceIP(ip net.IP) bool {
	addresses, err := net.InterfaceAddrs()
	if err != nil {
		return false
	}
	for _, address := range addresses {
		network, ok := address.(*net.IPNet)
		if ok && network.IP.Equal(ip) {
			return true
		}
	}
	return false
}
