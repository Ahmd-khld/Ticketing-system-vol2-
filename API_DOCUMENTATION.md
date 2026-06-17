# 📡 Smart Garden IoT Ticketing System - API Documentation

This document outlines the core backend REST APIs and their functionalities. The system uses a strict Defense-in-Depth strategy, employing rate limiting, RBAC (Role-Based Access Control), JWT Authentication, and WebSockets for real-time telemetry.

> [!NOTE]
> All secure routes expect a valid JSON Web Token (JWT) in the HTTP `Authorization` header formatted as: `Bearer <token>`.

---

## 🔐 1. Authentication & Identity (`/api/v1/auth`)
Handles user registration, login, 2FA, and session management.

### `POST /api/v1/auth/register`
- **Description**: Registers a new standard user.
- **Middleware**: `authLimiter`, `validateRequest`
- **Body**: `name`, `email`, `password`, `phone` (optional).

### `POST /api/v1/auth/login`
- **Description**: Authenticates a user. If 2FA is enabled, triggers OTP flow.
- **Middleware**: `authLimiter`
- **Body**: `email`, `password`

### `POST /api/v1/auth/verify-2fa`
- **Description**: Verifies the OTP sent via email during login.
- **Body**: `email`, `otp`
- **Response**: JWT Token & User Profile.

### `PUT /api/v1/auth/profile`
- **Description**: Updates the logged-in user's profile data.
- **Middleware**: `protect`

---

## 🛡️ 2. Security & Access Control (`/api/v1/admin`)
Restricted to `admin` and `sub-admin` roles. Contains strict mitigation pipelines and triggers `AdminAuditLog` on failure.

### `GET /api/v1/admin/users`
- **Description**: Fetches paginated user accounts with search capabilities.
- **Middleware**: `verifyAdminWhitelist`, `requireAdmin`

### `PATCH /api/v1/admin/users/:id/restrict`
- **Description**: Instantly restricts a user account, terminating their active sessions.
- **Middleware**: `requireAdmin`

### `POST /api/v1/admin/sub-admin`
- **Description**: Provisions a new sub-admin account and immediately binds their IP to the whitelist.
- **Middleware**: `requireSuperAdmin`

### `GET /api/v1/admin/audit-logs`
- **Description**: Retrieves immutable logs of admin actions and failed privilege escalation attempts.

### `GET /api/v1/admin/whitelisted-ips`
- **Description**: Fetches the list of IPs explicitly allowed to access admin routes.

---

## 🎟️ 3. Ticketing & Operations (`/api/v1/tickets`)
Manages the lifecycle of park entry tickets.

### `POST /api/v1/tickets/purchase`
- **Description**: Initiates a ticket purchase for the logged-in user.
- **Body**: `ticketType`, `promoCode` (optional).

### `GET /api/v1/tickets/my-tickets`
- **Description**: Retrieves all tickets owned by the authenticated user.

### `POST /api/v1/admin/scan`
- **Description**: Marks a ticket as 'scanned' at the physical gate.
- **Middleware**: `requireAdmin`

---

## ⚙️ 4. Hardware & IoT Telemetry (`/api/v1/admin/hardware-alerts`)
Handles ingestion and reporting of physical sensor nodes (e.g. soil moisture, gate sensors).

### `GET /api/v1/admin/hardware-stats`
- **Description**: Aggregates hardware alert severity metrics (Low vs Critical).

### `GET /api/v1/admin/hardware-alerts`
- **Description**: Fetches a paginated history of physical hardware anomalies.

---

## 💰 5. Promotions (`/api/v1/promo`)

### `POST /api/v1/promo/verify`
- **Description**: Validates a promotional code and returns the discount percentage.
- **Middleware**: `promoLimiter`
- **Body**: `code`

---

## 📡 6. Real-Time Telemetry (WebSockets)
The backend utilizes `Socket.io` to broadcast state changes instantly to the React frontend.

### `wss://<host>/`
- **Handshake Middleware**: `jwtSocketHandshake`
- **Events Emitted**:
  - `hardwareAlert`: Emitted when a physical sensor triggers a critical state.
  - `auditLogUpdate`: Emitted when a malicious actor attempts unauthorized access.
  - `occupancyUpdate`: Emitted when the park's physical occupancy counter changes.
