# YAVAM HTTP API Documentation

The YAVAM HTTP Server enables web clients (e.g., mobile devices, browsers) to interact with the managed libraries.

## Base URL
Default: `http://<Local_IP>:<Port>` (e.g., `http://192.168.1.10:8080`)

## Endpoints

### 1. Get Packages
Retrieves the list of packages for a specific library path. Triggers a scan if not already cached/in-memory (though currently it scans on demand).

- **URL**: `/api/packages`
- **Method**: `GET`
- **Query Params**:
    - `path` (optional): The library path to scan. Defaults to the active path configured on the server.
- **Response**: JSON array of `VarPackage` objects.
- **Behavior**:
    - This is a long-running request that streams progress via SSE (Server-Sent Events) to `/api/events` while building the response.
    - **Concurrency**: Only one scan can run at a time per server instance. New requests will cancel any previous running scan and wait for it to stop before starting.

### 2. Cancel Scan
Cancels the currently running scan operation on the server.

- **URL**: `/api/scan/cancel`
- **Method**: `GET` (or `POST`)
- **Response**: JSON `{"success": true}`
- **Behavior**:
    - Signals the running scan to stop.
    - **Synchronous**: This request **waits** until the scan has fully stopped and resources are released before returning. This prevents race conditions when switching libraries immediately after.

### 3. Get Thumbnail
Retrieves the thumbnail image for a specific package.

- **URL**: `/api/thumbnail`
- **Method**: `GET`
- **Query Params**:
    - `filePath`: Absolute path to the package file.
- **Response**: Binary image data (JPEG).
- **Security**: Validates that `filePath` is within allowed library paths.

### 4. Upload Package
Uploads a `.var` file to a library.

- **URL**: `/api/upload`
- **Method**: `POST`
- **Body**: `multipart/form-data` with `file` field.
- **Query Params**:
    - `path` (optional): Target library path.
- **Response**: JSON status.

### 5. Config
Retrieves the current server configuration.

- **URL**: `/api/config`
- **Method**: `GET`
- **Response**: JSON object with `webMode`, `path` (active path), `libraries` (list).

### 6. Server-Sent Events (SSE)
Real-time events stream.

- **URL**: `/api/events`
- **Method**: `GET` (EventSource)
- **Events**:
    - `scan:progress`: `{"current": 10, "total": 50}`
    - `package:scanned`: `VarPackage` object (incremental updates)
    - `server:log`: Log messages from the server.
