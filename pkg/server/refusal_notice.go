package server

import (
	"sync"
	"time"
)

const (
	refusalNoticeInterval   = time.Minute
	refusalNoticeMaxTracked = 64
)

// refusalNotices decides when a refusal is worth a log line: once per distinct
// subject per interval. Memory is bounded because the subject is attacker
// controlled; when full, the subject noticed longest ago is forgotten.
type refusalNotices struct {
	mu         sync.Mutex
	now        func() time.Time
	interval   time.Duration
	maxTracked int
	lastNotice map[string]time.Time
	order      []string // subjects from least to most recently noticed
}

func newRefusalNotices(now func() time.Time, interval time.Duration, maxTracked int) *refusalNotices {
	return &refusalNotices{
		now:        now,
		interval:   interval,
		maxTracked: maxTracked,
		lastNotice: make(map[string]time.Time),
	}
}

// shouldNotice reports whether subject is due a log line, and records it if so.
// A nil tracker (a Server built without NewServer) never logs.
func (n *refusalNotices) shouldNotice(subject string) bool {
	if n == nil {
		return false
	}
	n.mu.Lock()
	defer n.mu.Unlock()

	now := n.now()
	last, known := n.lastNotice[subject]
	if known && now.Sub(last) < n.interval {
		return false
	}
	if known {
		n.forget(subject)
	}
	for len(n.order) >= n.maxTracked {
		n.forget(n.order[0])
	}
	n.lastNotice[subject] = now
	n.order = append(n.order, subject)
	return true
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
