package server

import (
	"sync"
	"time"
)

const (
	refusalNoticeInterval   = time.Minute
	refusalNoticeMaxTracked = 64

	refusalNoticeWindow         = time.Minute
	refusalNoticeMaxPerWindow   = 5
	refusalSuppressedLineFormat = "%d more refused requests were not logged."
)

// refusalNotices decides when a refusal is worth a log line. Two limits apply:
// once per distinct subject per interval, and a global cap of lines per window
// across all subjects, because the subject is attacker controlled and distinct
// subjects are free to mint. Memory is bounded the same way; when the tracker
// is full, the subject noticed longest ago is forgotten.
//
// Suppressed lines are counted and reported by the first refusal of the next
// window, so no timer or goroutine is needed.
type refusalNotices struct {
	mu         sync.Mutex
	now        func() time.Time
	interval   time.Duration
	maxTracked int
	lastNotice map[string]time.Time
	order      []string // subjects from least to most recently noticed

	window         time.Duration
	maxPerWindow   int
	windowStart    time.Time
	loggedInWindow int
	suppressed     int
}

// refusalDecision is the outcome of one refusal: whether to log it, and how
// many lines the previous window suppressed (zero when none to report).
type refusalDecision struct {
	log               bool
	suppressedEarlier int
}

func newRefusalNotices(now func() time.Time, interval time.Duration, maxTracked int) *refusalNotices {
	return &refusalNotices{
		now:          now,
		interval:     interval,
		maxTracked:   maxTracked,
		lastNotice:   make(map[string]time.Time),
		window:       refusalNoticeWindow,
		maxPerWindow: refusalNoticeMaxPerWindow,
	}
}

// decide reports whether subject is due a log line, and records it if so.
// A nil tracker (a Server built without NewServer) never logs.
func (n *refusalNotices) decide(subject string) refusalDecision {
	if n == nil {
		return refusalDecision{}
	}
	n.mu.Lock()
	defer n.mu.Unlock()

	now := n.now()
	decision := refusalDecision{suppressedEarlier: n.rollWindow(now)}

	last, known := n.lastNotice[subject]
	if known && now.Sub(last) < n.interval {
		return decision
	}
	if n.loggedInWindow >= n.maxPerWindow {
		n.suppressed++
		return decision
	}
	n.loggedInWindow++

	if known {
		n.forget(subject)
	}
	for len(n.order) >= n.maxTracked {
		n.forget(n.order[0])
	}
	n.lastNotice[subject] = now
	n.order = append(n.order, subject)
	decision.log = true
	return decision
}

// rollWindow starts a new window once the current one has elapsed and returns
// the number of lines the finished window suppressed.
func (n *refusalNotices) rollWindow(now time.Time) int {
	if !n.windowStart.IsZero() && now.Sub(n.windowStart) < n.window {
		return 0
	}
	suppressed := n.suppressed
	n.windowStart = now
	n.loggedInWindow = 0
	n.suppressed = 0
	return suppressed
}

func (n *refusalNotices) forget(subject string) {
	delete(n.lastNotice, subject)
	for index, tracked := range n.order {
		if tracked == subject {
			n.order = append(n.order[:index], n.order[index+1:]...)
			return
		}
	}
}
