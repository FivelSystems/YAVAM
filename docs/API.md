# YAVAM HTTP API Documentation

The YAVAM HTTP Server enables web clients (e.g., mobile devices, browsers) to interact with the managed libraries.

## Base URL
Default: `http://<Local_IP>:<Port>` (e.g., `http://192.168.1.10:18888`)

## Authentication
> [!IMPORTANT]
> All endpoints (except `/api/auth/*` and `/api/events`) require valid authentication.

1.  **Challenge-Response**: Request a nonce from `/api/auth/challenge`.
2.  **Proof**: Calculate `SHA256(SHA256(password) + nonce)`.
3.  **Login**: Submit proof to `/api/auth/login` to receive a Bearer Token.
4.  **Token**: Send token in `Authorization: Bearer <token>` header.

## Rate Limiting
-   **Login Endpoints**: Limited to 5 requests per minute per IP.
-   **Violation**: Returns `429 Too Many Requests`.

## Endpoints

### 1. Authentication

#### Initiate Login (Challenge)
-   **URL**: `/api/auth/challenge`
-   **Method**: `POST`
-   **Body**: `{"username": "admin"}`
-   **Response**: `{"success": true, "nonce": "..."}`

#### Complete Login
-   **URL**: `/api/auth/login`
-   **Method**: `POST`
-   **Body**: `{"username": "admin", "nonce": "...", "proof": "...", "deviceName": "..."}`
-   **Response**: `{"success": true, "token": "..."}`

#### List Sessions
-   **URL**: `/api/auth/sessions`
-   **Method**: `GET`
-   **Response**: JSON array of active sessions (User objects).

#### Revoke Session
-   **URL**: `/api/auth/revoke`
-   **Method**: `POST`
-   **Body**: `{"id": "<session_id>"}`
-   **Response**: `{"success": true}`

### 2. Library Operations

#### Get Packages
Retrieves the list of packages for a specific library path.
-   **URL**: `/api/packages`
-   **Method**: `GET`
-   **Query Params**: `path` (optional)
-   **Response**: JSON array of `VarPackage` objects.

#### File Upload
-   **URL**: `/api/upload`
-   **Method**: `POST`
-   **Body**: `multipart/form-data` (`file`)
-   **Query Params**: `path` (target library)
-   **Response**: `{"success": true, "count": 1}`

#### Delete Package
-   **URL**: `/api/delete`
-   **Method**: `POST`
-   **Body**: `{"filePath": "...", "libraryPath": "..."}`

#### Toggle Package (Enable/Disable)
-   **URL**: `/api/toggle`
-   **Method**: `POST`
-   **Body**: `{"filePath": "...", "enable": true, "merge": false}`

#### Get Disk Space
-   **URL**: `/api/disk-space`
-   **Method**: `GET`
-   **Query Params**: `path`
-   **Response**: `{"free": 12345, "total": 99999, "used": ...}`

### 3. Server-Sent Events (SSE)
Real-time events stream for scan progress, logs, and updates.
-   **URL**: `/api/events`
-   **Method**: `GET`
-   **Events**:
    -   `scan:progress`: `{"current": 10, "total": 50}`
    -   `package:scanned`: `VarPackage` object (incremental updates)
    -   `server:log`: Log messages.
