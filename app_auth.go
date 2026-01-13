package main

import "fmt"

// UpdatePassword allows the user to change the admin password
func (a *App) UpdatePassword(newPassword string) error {
	if a.auth == nil {
		return fmt.Errorf("auth service not initialized")
	}
	return a.auth.SetPassword(newPassword)
}
