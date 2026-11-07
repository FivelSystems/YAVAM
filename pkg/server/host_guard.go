package server

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"yavam/pkg/utils"
)

const (
	hostRefusalPrefix   = "host:"
	originRefusalPrefix = "origin:"

	forbiddenHostCharacters = `@%/\`
	maxPortDigits           = 5
	minPort                 = 1
	maxPort                 = 65535

	localhostName = "localhost"
	mDNSSuffix    = ".local"

	messageRequestNotAllowed = "Request not allowed"
)

// hostNameOf reduces a Host header or host:port to its lowercase bare name, so
// "Localhost:8080", "[::1]:8080" and "[::1]" compare as "localhost" and "::1".
// The parser is strict: anything that is not exactly host, host:port or a
// bracketed IPv6 literal with an optional port yields "", which no allow-list
// accepts and the loopback check treats as non-local.
func hostNameOf(hostPort string) string {
	if hostPort == "" || strings.ContainsFunc(hostPort, isForbiddenHostRune) {
		return ""
	}
	host, ok := splitHostAndPort(hostPort)
	if !ok {
		return ""
	}
	host = strings.TrimSuffix(strings.ToLower(host), ".")
	if host == "" {
		return ""
	}
	return host
}

func isForbiddenHostRune(character rune) bool {
	return character <= ' ' || character == 0x7f || strings.ContainsRune(forbiddenHostCharacters, character)
}

// splitHostAndPort separates the name from an optional numeric port. A
// bracketed host must be an IPv6 literal; an unbracketed one may not contain
// brackets or colons.
func splitHostAndPort(hostPort string) (host string, ok bool) {
	if strings.HasPrefix(hostPort, "[") {
		closing := strings.IndexByte(hostPort, ']')
		if closing < 0 {
			return "", false
		}
		host, remainder := hostPort[1:closing], hostPort[closing+1:]
		if ip := net.ParseIP(host); ip == nil || !strings.Contains(host, ":") {
			return "", false
		}
		if remainder == "" {
			return host, true
		}
		return host, strings.HasPrefix(remainder, ":") && isValidPort(remainder[1:])
	}

	if strings.ContainsAny(hostPort, "[]") || strings.Count(hostPort, ":") > 1 {
		return "", false
	}
	host, port, hasPort := strings.Cut(hostPort, ":")
	if hasPort && !isValidPort(port) {
		return "", false
	}
	return host, true
}

func isValidPort(port string) bool {
	if port == "" || len(port) > maxPortDigits {
		return false
	}
	for _, digit := range port {
		if digit < '0' || digit > '9' {
			return false
		}
	}
	number, err := strconv.Atoi(port)
	return err == nil && number >= minPort && number <= maxPort
}

func isLocalHostName(host string) bool {
	if host == localhostName {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// machineHostNames lists the names this machine is reachable by on a LAN: its
// hostname, the first label of it, and the mDNS ".local" form of that label.
func machineHostNames() map[string]bool {
	names := make(map[string]bool)
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		return names
	}
	hostname = strings.ToLower(hostname)
	shortName, _, _ := strings.Cut(hostname, ".")
	for _, name := range []string{hostname, shortName, shortName + mDNSSuffix} {
		names[name] = true
	}
	return names
}

// hostAllowed is the Host allow-list. IP literals are always accepted: a
// browser reaching a server by a DNS name that later re-resolves to the
// server's address is the case to refuse, and that always arrives with a name.
func (s *Server) hostAllowed(host string) bool {
	if host == "" {
		return false
	}
	if net.ParseIP(host) != nil || host == localhostName || s.machineNames[host] {
		return true
	}
	if s.manager == nil {
		return false
	}
	for _, allowed := range s.manager.GetConfig().ServerAllowedHosts {
		if host == allowed {
			return true
		}
	}
	return false
}

func (s *Server) originAllowed(origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" {
		return false
	}
	return s.hostAllowed(hostNameOf(parsed.Host))
}

// explainRefusedHost and explainRefusedOrigin tell the desktop console why a
// request was refused, so a user on a custom LAN DNS name learns about
// serverAllowedHosts. Only the sanitised Host or Origin header is logged,
// rate-limited per distinct value and globally, see refusalNotices.
func (s *Server) explainRefusedHost(host string) {
	logged := utils.SanitizeForLog(host)
	s.logRefusal(hostRefusalPrefix+logged, fmt.Sprintf("Request refused: host %s is not allowed. To allow it, add it to serverAllowedHosts in config.json.", logged))
}

func (s *Server) explainRefusedOrigin(origin string) {
	logged := utils.SanitizeForLog(origin)
	s.logRefusal(originRefusalPrefix+logged, fmt.Sprintf("Request refused: origin %s is not allowed. To allow its host, add it to serverAllowedHosts in config.json.", logged))
}

func (s *Server) logRefusal(subject, message string) {
	decision := s.refusalNotices.decide(subject)
	if decision.suppressedEarlier > 0 {
		s.log(fmt.Sprintf(refusalSuppressedLineFormat, decision.suppressedEarlier))
	}
	if decision.log {
		s.log(message)
	}
}

// hostGuardMiddleware refuses requests addressed to a name the server does not
// recognise, and requests whose Origin names such a host. Users who open the
// app by a custom LAN DNS name list it in config.json "serverAllowedHosts".
func (s *Server) hostGuardMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.hostAllowed(hostNameOf(r.Host)) {
			s.explainRefusedHost(r.Host)
			s.writeError(w, messageRequestNotAllowed, http.StatusMisdirectedRequest)
			return
		}
		if origin := r.Header.Get(headerOrigin); origin != "" && !s.originAllowed(origin) {
			s.explainRefusedOrigin(origin)
			s.writeError(w, messageRequestNotAllowed, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
