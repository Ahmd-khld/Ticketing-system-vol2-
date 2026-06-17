# Smart Park — Architecture

A full-stack IoT ticketing & access-control system for a smart park, with a
hardware tier (ESP32 / Arduino), a Node.js/MongoDB backend, a React frontend, and
a Python-based GRC (Governance, Risk & Compliance) risk engine.

```
┌──────────────┐     telemetry (HTTP)      ┌─────────────────────┐     WebSocket      ┌──────────────┐
│  ESP32 /     │ ─────────────────────────▶│   Node.js Backend    │◀──────────────────▶│   React SPA  │
│  Arduino     │  POST /api/hardware/...    │  (Express + Mongoose)│   Socket.IO        │  (Vite)      │
│  + ESP-01S   │◀───────────────────────── │                      │ ─────────────────▶ │              │
└──────────────┘   remote commands         └──────────┬──────────┘   REST /api/*       └──────────────┘
                                                        │
                                          spawn()       ▼
                                            ┌────────────────────────┐
                                            │  Python GRC risk engine │
                                            │  (grc_bridge.py)        │
                                            └────────────────────────┘
```

## Components

### 1. Hardware tier
- **`arduino/`** — Arduino Uno firmware using an ESP-01S as a WiFi modem (AT
  commands over `SoftwareSerial`). Modular design: `PeripheralInterface`
  (sensors/actuators), `RuntimeDispatcher` (loop + command routing),
  `WiFiModule`, and `Secure/InsecureSocket`.
- **`esp32/`** — Native ESP-IDF (C++) port of the same node for ESP32, runnable
  under QEMU (`idf.py qemu`). Mirrors `PeripheralInterface` / `RuntimeDispatcher`
  and emits the same telemetry JSON shape.
- Telemetry is POSTed to `/api/hardware/telemetry`; the backend can push remote
  commands (gate/pump/lamp/RGB) back to the node.

### 2. Backend (`backend/`)
Express 5 + Mongoose, layered as:

| Layer | Path | Responsibility |
|-------|------|----------------|
| Routes | `routes/` | HTTP surface, middleware wiring |
| Controllers | `controllers/` | Request handling / business logic |
| Models | `models/` | Mongoose schemas |
| Middleware | `middleware/` | Auth, rate limiting, validation, IP control |
| Validators | `validators/` | Zod request schemas |
| Utils | `utils/` | OTP service, email, logger, GRC bridge |

Key cross-cutting middleware (`app.js`): CORS allow-list, `express-mongo-sanitize`,
cookie→Authorization bridging, banned-IP check, and a central error handler.

### 3. Frontend (`frontend/`)
React 18 + Vite + Tailwind. `src/api.js` is a shared Axios instance that attaches
the JWT and globally handles 401 (logout) / 403 (restriction). Real-time updates
arrive over Socket.IO (`src/socket.js`).

### 4. GRC engine (`backend/*.py`)
`grc_bridge.py` / `risk_engine.py` / `compliance.py` implement a CIS-controls risk
assessment. The Node `utils/grcService.js` debounces admin actions and `spawn()`s
the Python bridge, then broadcasts results to admins over Socket.IO.

## Authentication & session model
- **JWT** signed with `JWT_SECRET`, payload `{ id, v: tokenVersion }`, 30-day expiry.
- **Session invalidation** is global per user via `user.tokenVersion`: bumping it
  invalidates every previously issued token (used on logout-all, password reset,
  email change, account deletion).
- `protect` middleware authenticates; `requireAdmin` / `requireSuperAdmin` gate
  privileged routes; `verifyAdminWhitelist` adds IP allow-listing for admin APIs.

## OTP / verification model
All one-time codes flow through **`utils/otpService.js`**:
- `generateOtp()` — `crypto.randomInt` (CSPRNG), 6 digits.
- Codes are stored **hashed** (HMAC-SHA256 + pepper), never plaintext.
- `issueOtp(email)` / `consumeOtp(email, code)` back the legacy email flows
  (registration verify, login 2FA, password reset, account deletion).
- The **secure email-change flow** (`emailChangeController` +
  `EmailChangeRequest`) adds: password re-auth → 2FA code to the current address →
  duplicate check → code to the new address → commit + session invalidation. Its
  inter-step token is signed with a **separate secret** so it can never be replayed
  as a normal session token. OTP emails share one template (`utils/otpEmail.js`).

Brute-force defense is layered: IP rate limits (`middleware/rateLimiters.js`) +
per-request attempt caps inside the controllers.

## Data flow examples
- **Telemetry:** node → `POST /api/hardware/telemetry` → `Telemetry` model →
  Socket.IO `dataRefresh` → admin dashboards update live.
- **Ticket scan:** gate scanner → admin scan endpoint → ticket status update →
  `broadcastTicketStatus` emits to the owner's room + global listeners.
- **Admin action:** any mutating admin call → `logAdminAction` writes an audit log
  and debounce-triggers a GRC re-assessment.

## Testing
- Backend: Jest + Supertest + `mongodb-memory-server` (12 suites / 56 tests).
  `jest.config.js` auto-detects a local `mongod` to avoid the binary download;
  `NODE_ENV=test` skips rate limiting and the GRC Python spawn for isolation.
- Run: `npm test` (backend), `npm run build` (frontend), `idf.py qemu` (esp32).

## Known follow-ups
- Finish decomposing `controllers/adminController.js` by domain (users, hardware,
  audit/IP, backups, tickets) — shared helpers already extracted to
  `controllers/admin/helpers.js`.
- Extract large React pages (`Profile.jsx`, `AdminGRC.jsx`) into smaller components
  once a frontend test harness exists.
- Replace the Arduino placeholder `signPayload` with a real HMAC.
