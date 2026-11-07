package main

import (
	"errors"

	"yavam/pkg/services/remoteaccess"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var errRemoteAccessUnavailable = errors.New("auth service not initialized")

func (a *App) remoteAccessService() (*remoteaccess.Service, error) {
	if a.remoteAccess == nil {
		return nil, errRemoteAccessUnavailable
	}
	return a.remoteAccess, nil
}

// SetPassword updates the admin password; the setup wizard and the settings
// screen both reach it, so the password rules apply to both.
func (a *App) SetPassword(password string) error {
	service, err := a.remoteAccessService()
	if err != nil {
		return err
	}
	return service.SetAdminPassword(password)
}

// UpdatePassword is the settings-screen name for SetPassword.
func (a *App) UpdatePassword(newPassword string) error {
	return a.SetPassword(newPassword)
}

// GetRemoteAccessState reports the remote access settings and whether a
// pairing code is outstanding. It never returns the code.
func (a *App) GetRemoteAccessState() (remoteaccess.State, error) {
	service, err := a.remoteAccessService()
	if err != nil {
		return remoteaccess.State{}, err
	}
	return service.State(), nil
}

// CreatePairingCode issues a one-time code for pairing a device. This is the
// only call that returns the code itself.
func (a *App) CreatePairingCode() (remoteaccess.PairingGrant, error) {
	service, err := a.remoteAccessService()
	if err != nil {
		return remoteaccess.PairingGrant{}, err
	}
	return service.CreatePairingCode()
}

// SetAllowRemotePasswordLogin lets other devices sign in with the admin password.
func (a *App) SetAllowRemotePasswordLogin(allowed bool) error {
	service, err := a.remoteAccessService()
	if err != nil {
		return err
	}
	return service.SetAllowRemotePasswordLogin(allowed)
}

// SetServerBindAddress accepts "all", "loopback" or the IP of a local network
// interface, and rebinds the web server if it is running.
func (a *App) SetServerBindAddress(address string) error {
	service, err := a.remoteAccessService()
	if err != nil {
		return err
	}
	err = service.SetServerBindAddress(address)
	if a.ctx != nil && a.server != nil {
		runtime.EventsEmit(a.ctx, "server:status:changed", a.server.IsRunning())
	}
	return err
}
