### Features

### Bugs
- The same client can trigger multiple login requests, causing the same device to appear multiple times in the active devices list
- Login screen is appearing twice, one timme for the full page, and a second time when the dashboard loads.
- We need to get rid of the login page, and continue with the standard modal format.
- The server's flag for 'Public access' does not guarantee to allow anyone view library contents, it should only prevent from locking the entire application behind a login screen.
- Switching between libraries should trigger authentication modal, based on the chosen library's configuration, requires enhaced llibrary management update first because we need advanced settings and configs.

