package server

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"
	"yavam/pkg/services/config"
)

const refusalLogMarker = "Request refused"

func newRefusalTestServer(t *testing.T, maxTracked int) (*Server, *logCapture, *fakeClock) {
	t.Helper()
	s, logs := startAuthServer(t, &scriptedAuth{passwordSet: true}, &config.Config{ServerAllowedHosts: []string{"yavam.home.lan"}})
	s.machineNames = map[string]bool{}
	clock := &fakeClock{now: time.Now()}
	s.refusalNotices = newRefusalNotices(clock.Now, refusalNoticeInterval, maxTracked)
	return s, logs, clock
}

func refusalLines(logs *logCapture) []string {
	var lines []string
	for _, line := range strings.Split(logs.joined(), "\n") {
		if strings.Contains(line, refusalLogMarker) {
			lines = append(lines, line)
		}
	}
	return lines
}

func TestRefusalLog_FirstRefusalExplainsHowToAllowTheHost(t *testing.T) {
	s, logs, _ := newRefusalTestServer(t, refusalNoticeMaxTracked)

	statusWithHost(s, foreignHost+":18888")

	lines := refusalLines(logs)
	want := `Request refused: host "evil.example:18888" is not allowed. To allow it, add it to serverAllowedHosts in config.json.`
	if len(lines) != 1 || lines[0] != want {
		t.Fatalf("got %q, want one line %q", lines, want)
	}
}

func TestRefusalLog_RepeatsWithinTheIntervalAreSilentThenLogAgain(t *testing.T) {
	s, logs, clock := newRefusalTestServer(t, refusalNoticeMaxTracked)

	statusWithHost(s, foreignHost)
	clock.Advance(refusalNoticeInterval - time.Second)
	statusWithHost(s, foreignHost)
	if got := len(refusalLines(logs)); got != 1 {
		t.Fatalf("repeat inside the interval logged: %d lines", got)
	}

	clock.Advance(time.Second)
	statusWithHost(s, foreignHost)
	if got := len(refusalLines(logs)); got != 2 {
		t.Fatalf("expected a second line after the interval, got %d", got)
	}
}

func TestRefusalLog_DistinctHostsAreTrackedSeparately(t *testing.T) {
	s, logs, _ := newRefusalTestServer(t, refusalNoticeMaxTracked)

	statusWithHost(s, "a.example")
	statusWithHost(s, "b.example")

	if got := len(refusalLines(logs)); got != 2 {
		t.Fatalf("expected a line per host, got %d", got)
	}
}

func TestRefusalLog_TrackedHostsAreCappedEvictingTheOldest(t *testing.T) {
	const trackedCap = 3
	s, logs, _ := newRefusalTestServer(t, trackedCap)

	for i := 0; i < trackedCap+1; i++ {
		statusWithHost(s, fmt.Sprintf("host%d.example", i))
	}
	if got := len(s.refusalNotices.lastNotice); got != trackedCap {
		t.Fatalf("tracked %d hosts, cap is %d", got, trackedCap)
	}
	if got := len(s.refusalNotices.order); got != trackedCap {
		t.Fatalf("order holds %d hosts, cap is %d", got, trackedCap)
	}

	before := len(refusalLines(logs))
	statusWithHost(s, "host3.example")
	if got := len(refusalLines(logs)); got != before {
		t.Fatal("a still-tracked host logged again")
	}
	statusWithHost(s, "host0.example")
	if got := len(refusalLines(logs)); got != before+1 {
		t.Fatal("the evicted host should be noticed again")
	}
}

func TestRefusalLog_HostIsSanitised(t *testing.T) {
	s, logs, _ := newRefusalTestServer(t, refusalNoticeMaxTracked)

	statusWithHost(s, "evil\x1b[31m.example‮")

	joined := strings.Join(refusalLines(logs), "\n")
	if strings.ContainsAny(joined, "\x1b‮") {
		t.Fatalf("control or format characters survived: %q", joined)
	}
	if !strings.Contains(joined, `"evil[31m.example"`) {
		t.Fatalf("expected the sanitised host in %q", joined)
	}
}

func TestRefusalLog_OriginRefusalHasItsOwnLine(t *testing.T) {
	s, logs, _ := newRefusalTestServer(t, refusalNoticeMaxTracked)

	do(s, http.MethodGet, statusRoute, "", loopbackPeer, map[string]string{headerOrigin: "http://" + foreignHost})

	lines := refusalLines(logs)
	want := `Request refused: origin "http://evil.example" is not allowed. To allow its host, add it to serverAllowedHosts in config.json.`
	if len(lines) != 1 || lines[0] != want {
		t.Fatalf("got %q, want one line %q", lines, want)
	}
}

func TestRefusalLog_HostAndOriginRefusalsDoNotSuppressEachOther(t *testing.T) {
	s, logs, _ := newRefusalTestServer(t, refusalNoticeMaxTracked)

	statusWithHost(s, foreignHost)
	do(s, http.MethodGet, statusRoute, "", loopbackPeer, map[string]string{headerOrigin: foreignHost})

	if got := len(refusalLines(logs)); got != 2 {
		t.Fatalf("expected one host and one origin line, got %d", got)
	}
}

func TestRefusalLog_AllowedHostsAreNotLogged(t *testing.T) {
	s, logs, _ := newRefusalTestServer(t, refusalNoticeMaxTracked)

	for _, host := range []string{"127.0.0.1:18888", "localhost", "yavam.home.lan"} {
		if w := statusWithHost(s, host); w.Code != http.StatusOK {
			t.Fatalf("Host %q: expected 200, got %d", host, w.Code)
		}
	}
	if lines := refusalLines(logs); len(lines) != 0 {
		t.Fatalf("allowed hosts logged: %q", lines)
	}
}

func TestRefusalLog_NeverIncludesPathOrQuery(t *testing.T) {
	s, logs, _ := newRefusalTestServer(t, refusalNoticeMaxTracked)

	do(s, http.MethodGet, "/files/?path=secret-token", "", loopbackPeer, map[string]string{"Host": foreignHost})

	if joined := strings.Join(refusalLines(logs), "\n"); strings.Contains(joined, "secret-token") || strings.Contains(joined, "/files") {
		t.Fatalf("request URL leaked into the log: %q", joined)
	}
}

func suppressedSummaryLines(logs *logCapture) []string {
	var lines []string
	for _, line := range strings.Split(logs.joined(), "\n") {
		if strings.Contains(line, "were not logged") {
			lines = append(lines, line)
		}
	}
	return lines
}

func TestRefusalLog_FloodOfDistinctHostsIsCappedPerWindowWithOneSummary(t *testing.T) {
	s, logs, clock := newRefusalTestServer(t, refusalNoticeMaxTracked)
	const flood = 40

	for i := 0; i < flood; i++ {
		statusWithHost(s, fmt.Sprintf("flood%d.example", i))
	}
	if got := len(refusalLines(logs)); got != refusalNoticeMaxPerWindow {
		t.Fatalf("logged %d refusal lines in one window, cap is %d", got, refusalNoticeMaxPerWindow)
	}
	if got := len(suppressedSummaryLines(logs)); got != 0 {
		t.Fatalf("summary emitted before the window ended: %d", got)
	}

	clock.Advance(refusalNoticeWindow)
	statusWithHost(s, "next-window.example")

	summaries := suppressedSummaryLines(logs)
	want := fmt.Sprintf("%d more refused requests were not logged.", flood-refusalNoticeMaxPerWindow)
	if len(summaries) != 1 || !strings.HasSuffix(summaries[0], want) {
		t.Fatalf("got %q, want one summary ending %q", summaries, want)
	}
	if got := len(refusalLines(logs)); got != refusalNoticeMaxPerWindow+1 {
		t.Fatalf("the new window should log again: %d refusal lines", got)
	}

	for i := 0; i < flood; i++ {
		statusWithHost(s, fmt.Sprintf("second%d.example", i))
	}
	if got := len(refusalLines(logs)); got != 2*refusalNoticeMaxPerWindow {
		t.Fatalf("second window logged %d lines in total, want %d", got, 2*refusalNoticeMaxPerWindow)
	}
	if got := len(suppressedSummaryLines(logs)); got != 1 {
		t.Fatalf("a window with nothing new to report must not repeat the summary, have %d", got)
	}
}

func TestRefusalLog_QuietWindowEmitsNoSummary(t *testing.T) {
	s, logs, clock := newRefusalTestServer(t, refusalNoticeMaxTracked)

	statusWithHost(s, "a.example")
	clock.Advance(refusalNoticeWindow)
	statusWithHost(s, "b.example")

	if got := len(suppressedSummaryLines(logs)); got != 0 {
		t.Fatalf("unexpected summary: %q", suppressedSummaryLines(logs))
	}
}

func TestRefusalLog_RepeatsOfLoggedHostDoNotUseTheGlobalCap(t *testing.T) {
	s, logs, _ := newRefusalTestServer(t, refusalNoticeMaxTracked)

	for i := 0; i < refusalNoticeMaxPerWindow-1; i++ {
		statusWithHost(s, fmt.Sprintf("h%d.example", i))
	}
	for i := 0; i < 100; i++ {
		statusWithHost(s, "h0.example")
	}
	statusWithHost(s, "last.example")

	if got := len(refusalLines(logs)); got != refusalNoticeMaxPerWindow {
		t.Fatalf("logged %d lines, want %d", got, refusalNoticeMaxPerWindow)
	}
}
