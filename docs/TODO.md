### Features
- Redesign settings modal to improve categorization, find a new layout without breaking the existing mobile responsiveness.
- Dedicated 'privacy' tab settings where censor/blur can be toggled on and off, and a slider to set the amount of blur.
Additional toggles for enabling/disabling package name and package thumbnail when privacy mode is on.
- (Queued for v1.4.0) Enhanced library management window with advanced settings and configs (See issue [#2](https://github.com/FivelSystems/YAVAM/issues/2))

### Bugs
- The same client can trigger multiple login requests, causing the same device to appear multiple times in the active devices list
- Login screen is appearing twice, one timme for the full page, and a second time when the dashboard loads.
- We need to get rid of the login page, and continue with the standard modal format.
- The server's flag for 'Public access' does not guarantee to allow anyone view library contents, it should only prevent from locking the entire application behind a login screen.
- Switching between libraries should trigger authentication modal, based on the chosen library's configuration, requires enhaced llibrary management update first because we need advanced settings and configs.

