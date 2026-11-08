package manager

import (
	"context"
	"sync"

	"yavam/pkg/utils"
)

// scanRegistry tracks the scans running per library so that removing a library
// can stop the scans that would otherwise keep working on it. Its zero value is
// ready to use.
type scanRegistry struct {
	mu      sync.Mutex
	nextID  uint64
	cancels map[string]map[uint64]context.CancelFunc
}

// register records a running scan of the library at path and returns the
// function that forgets it once the scan has ended.
func (r *scanRegistry) register(path string, cancel context.CancelFunc) (forget func()) {
	key := utils.CanonPath(path)

	r.mu.Lock()
	defer r.mu.Unlock()
	if r.cancels == nil {
		r.cancels = make(map[string]map[uint64]context.CancelFunc)
	}
	if r.cancels[key] == nil {
		r.cancels[key] = make(map[uint64]context.CancelFunc)
	}
	r.nextID++
	id := r.nextID
	r.cancels[key][id] = cancel

	return func() {
		r.mu.Lock()
		defer r.mu.Unlock()
		delete(r.cancels[key], id)
		if len(r.cancels[key]) == 0 {
			delete(r.cancels, key)
		}
	}
}

// cancelScansOf stops every running scan of the library at path.
func (r *scanRegistry) cancelScansOf(path string) {
	r.mu.Lock()
	running := make([]context.CancelFunc, 0, len(r.cancels[utils.CanonPath(path)]))
	for _, cancel := range r.cancels[utils.CanonPath(path)] {
		running = append(running, cancel)
	}
	r.mu.Unlock()

	for _, cancel := range running {
		cancel()
	}
}
