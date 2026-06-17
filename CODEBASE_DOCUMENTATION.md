# 📚 Smart Garden IoT: Deep Codebase Functionality Map

This is the comprehensive, deeply detailed **Master Functionality Index** for the entire codebase. It breaks down exactly what every major directory, controller, middleware, and React component does at a functional level.

---

## 🖥️ 1. Frontend Structure (`/frontend/src`)

### 📌 Core Architecture & Setup
- **`App.jsx`**: The master router. Wraps the app in Context Providers (`AuthProvider`, `SocketProvider`, `ThemeProvider`). Handles RBAC route protection (e.g. kicking standard users out of `/admin` routes).
- **`api.js`**: Axios interceptor setup. Automatically attaches the `Bearer` token to headers. Intercepts `401 Unauthorized` and `403 Forbidden` responses to automatically clear local storage and force a logout.
- **`socket.js`**: Initializes the global `Socket.io` client instance for real-time telemetry from the Node.js backend.

### 📌 Major Components (`components/`)
- **`GlobalErrorBoundary.jsx` & `WidgetErrorBoundary.jsx`**: React Error Boundaries. If a child component throws a JS error (e.g., failed to render a chart), these catch the error and display a fallback UI, preventing the entire React tree from crashing (White Screen of Death).
- **`TwoFactorModal.jsx`**: Intercepts sensitive actions (like logins or destructive config changes) and forces the user to enter an OTP sent to their email before proceeding.
- **`ConfirmModal.jsx` & `CustomModal.jsx`**: Reusable animated modal templates used for warnings, success messages, and destructive action confirmations.
- **`HardwareStatsWidget.jsx`**: A specialized Admin Dashboard widget that listens to WebSocket `hardwareAlert` events to plot physical sensor states on a live graph.
- **`Navbar.jsx`**: Dynamically renders links based on `role` (Admin vs Sub-Admin vs User).

### 📌 Client-Side Pages (`pages/`)
- **`LandingPage.jsx`**: Public entry point. Animated marketing page explaining the park's IoT features.
- **`BookingPage.jsx`**: Step-by-step wizard for purchasing tickets. Interacts with the backend to apply promo codes and calculate totals.
- **`Profile.jsx`**: User portal. Users can view active tickets, game stats, change passwords, and manage 2FA settings.
- **`GamePage.jsx`**: Interactive `Garden Catcher` minigame. High scores are synced to the backend to award promotional discounts.
- **`AdminGRC.jsx`**: The command center for administrators. Integrates multiple sub-tabs (User Management, Audit Logs, Security Whitelists, IoT Metrics).

---

## ⚙️ 2. Backend Structure (`/backend`)

### 📌 Business Logic Controllers (`controllers/`)

#### 1. `authController.js` (Identity Management)
- **`register`**: Creates a new user, hashes their password, and encrypts PII.
- **`login`**: Verifies credentials. If 2FA is enabled, halts the login and issues an OTP challenge.
- **`verify2FA`**: Validates the 6-digit OTP code against the hashed OTP in the database.
- **`generate2FA` / `disable2FA`**: Toggles multi-factor authentication for a user profile.

#### 2. `userController.js` (Profile Management)
- **`getUserProfile` / `updateUserProfile`**: CRUD operations for the logged-in user.
- **`forgotPassword` / `resetPassword`**: Handles email-based password recovery flows.
- **`requestAccountDeletion` / `confirmAccountDeletion`**: Manages GDPR-compliant soft deletes.

#### 3. `adminController.js` (Heavy Operations)
- **`getAdminStats`**: Aggregates top-level metrics (total users, active tickets, revenue).
- **`scanTicket` / `scanUserTicket`**: Validates QR codes at the physical gates and updates occupancy.
- **`getUsers` / `getAdmins`**: Fetches paginated, decrypted lists of accounts.
- **`toggleRestrictUser`**: Instantly bans a malicious user.
- **`forceLogoutAnd2FA`**: Boot kicks a user out and forces them to re-authenticate with an OTP.
- **`createSubAdmin`**: Provisions a new administrative account and binds their IP to the whitelist.
- **`getAuditLogs` / `clearAuditLogs`**: Manages the immutable ledger of security events.
- **`getWhitelistedIPs` / `getBannedIPs`**: Manages the dynamic firewall rules.
- **`createBackup` / `restoreBackup`**: Triggers `mongodump` and `mongorestore` shell processes to manage database snapshots.

#### 4. `ticketController.js` (Financial Core)
- **`checkout`**: Processes a ticket purchase, deducts capacity, and emails the PDF receipt.
- **`cancelTicket` / `rescheduleTicket`**: Modifies existing active tickets.
- **`getTicketHistory` / `getTicketInsights`**: Fetches historical purchasing data.

#### 5. `gameController.js` (Gamification)
- **`handleGameWin` / `handleGameLose`**: Syncs scores from the frontend minigame and awards promo codes.
- **`getLeaderboard`**: Fetches the top 10 players globally.

#### 6. `emailChangeController.js` (Secure Workflows)
- **`initiateEmailChange` / `verifyCurrentEmail` / `setNewEmail` / `verifyNewEmail`**: A strict, multi-step cryptographic flow ensuring an attacker cannot swap out an account's email address without access to the original inbox.

---

### 📌 Security Middleware (`middleware/`)

- **`authMiddleware.js (protect)`**: Extracts the JWT from the `Authorization` header. Verifies the `HMAC-SHA256` signature. Checks if the user is `isRestricted` and drops the request if they are banned.
- **`superAdminMiddleware.js`**: Secondary RBAC. Checks if the authenticated user explicitly matches the `SUPER_ADMIN_EMAIL` environment variable before allowing them to execute destructive routes (like restoring backups).
- **`ipControl.js`**: Dynamic firewall. Intercepts incoming requests, compares the IP against the `BannedIP` and `WhitelistedIP` MongoDB collections. Automatically bans IPs that trigger too many security violations.
- **`rateLimiters.js`**: Token-bucket memory limiters (e.g., `authLimiter`, `promoLimiter`). Stops credential stuffing and brute-forcing.
- **`validateRequest.js`**: Validates incoming JSON payloads against strictly defined `Zod` schemas (found in `validators/schemas.js`) to neutralize NoSQL injection.

---

### 📌 Data Models (`models/`)
*Note: All models containing PII utilize AES-256-GCM Field-Level Encryption getters/setters.*

- **`User.js`**: `name`, `email`, `phone`, `role`, `password` (bcrypt).
- **`Ticket.js`**: `validUntil`, `status`, `userId`.
- **`HardwareAlert.js`**: `sensorId`, `alertType`, `severity`, `timestamp`.
- **`AdminAuditLog.js`**: `email`, `ipAddress`, `action`, `status`. Immutable ledger.
- **`EmailChangeRequest.js`**: Temporary TTL (Time-To-Live) collection storing state during the 2-step email change workflow.

---

### 📌 Utilities (`utils/`)

- **`encryption.js`**: The cryptographic engine. Exports `encryptDeterministic` and `encryptRandom` using AES-256-GCM to secure data at rest. Includes backwards compatibility for legacy CBC ciphertexts.
- **`emailService.js`**: Wraps `nodemailer` to dispatch OTPs and Ticket Receipts over SMTP.
- **`generateToken.js`**: Signs standard JWTs for session management.

---

## 📡 3. Telemetry & Hardware Layer

- **`server.js` (Socket.io)**: Exposes a WebSocket server at `/state`. Requires JWT authentication to connect. Broadcasts `hardwareAlert`, `occupancyUpdate`, and `auditLogUpdate` instantly to the frontend.
- **`/arduino/smart_garden_wifi.ino`**: The C++ code deployed to the ESP32 physical edge sensors. It polls analog/digital pins and pushes JSON data (like low moisture or unauthorized gate movement) via HTTP to the backend telemetry routes.
