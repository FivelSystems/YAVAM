package server

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"yavam/pkg/utils"
)

const (
	hostRefusalPrefix   = "host:"
	originRefusalPrefix = "origin:"

	localhostName = "localhost"
	mDNSSuffix    = ".local"

	messageRequestNotAllowed = "Request not allowed"
)

// hostNameOf reduces a Host header or host:port to its lowercase bare name, so
// "Localhost:8080", "[::1]:8080" and "[::1]" compare as "localhost" and "::1".
func hostNameOf(hostPort string) string {
	host := hostPort
	if splitHost, _, err := net.SplitHostPort(hostPort); err == nil {
		host = splitHost
	}
	host = strings.Trim(strings.TrimSpace(host), "[]")
	return strings.TrimSuffix(strings.ToLower(host), ".")
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
// rate-limited per distinct value.
func (s *Server) explainRefusedHost(host string) {
	logged := utils.SanitizeForLog(host)
	if s.refusalNotices.shouldNotice(hostRefusalPrefix + logged) {
		s.log(fmt.Sprintf("Request refused: host %s is not allowed. To allow it, add it to serverAllowedHosts in config.json.", logged))
	}
}

func (s *Server) explainRefusedOrigin(origin string) {
	logged := utils.SanitizeForLog(origin)
	if s.refusalNotices.shouldNotice(originRefusalPrefix + logged) {
		s.log(fmt.Sprintf("Request refused: origin %s is not allowed. To allow its host, add it to serverAllowedHosts in config.json.", logged))
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
