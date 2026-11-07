package main

import (
	"errors"
	"testing"
)

func TestAuthMethodsReportUnavailableServiceInsteadOfPanicking(t *testing.T) {
	app := NewApp(nil, nil)

	if err := app.SetPassword("correct-horse-battery"); !errors.Is(err, errRemoteAccessUnavailable) {
		t.Errorf("SetPassword: got %v", err)
	}
	if err := app.UpdatePassword("correct-horse-battery"); !errors.Is(err, errRemoteAccessUnavailable) {
		t.Errorf("UpdatePassword: got %v", err)
	}
	if _, err := app.GetRemoteAccessState(); !errors.Is(err, errRemoteAccessUnavailable) {
		t.Errorf("GetRemoteAccessState: got %v", err)
	}
	if _, err := app.CreatePairingCode(); !errors.Is(err, errRemoteAccessUnavailable) {
		t.Errorf("CreatePairingCode: got %v", err)
	}
	if err := app.SetAllowRemotePasswordLogin(true); !errors.Is(err, errRemoteAccessUnavailable) {
		t.Errorf("SetAllowRemotePasswordLogin: got %v", err)
	}
	if err := app.SetServerBindAddress("loopback"); !errors.Is(err, errRemoteAccessUnavailable) {
		t.Errorf("SetServerBindAddress: got %v", err)
	}
}
