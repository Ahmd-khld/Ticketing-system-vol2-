# 🛡️ Secure Smart Garden IoT Management System

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248.svg)](https://www.mongodb.com/)
[![React](https://img.shields.io/badge/React-18.x-61DAFB.svg)](https://reactjs.org/)
[![Security](https://img.shields.io/badge/Security-Defense--in--Depth-red.svg)]()

An enterprise-grade, full-stack IoT management platform designed to monitor physical park infrastructure, automate ticketing, and mitigate network-layer threats in real-time. This system enforces the **Confidentiality, Integrity, and Availability (CIA) triad** directly at the application layer using specialized middleware pipelines and stateless WebSocket telemetry broadcasting.

---

## 📑 Table of Contents
1. [System Overview](#-system-overview)
2. [Architectural Diagrams](#-architectural-diagrams)
3. [Security Architecture & Threat Mitigation](#-security-architecture--threat-mitigation)
4. [Database Entity Relationship (ERD)](#-database-entity-relationship-erd)
5. [Core API Endpoints](#-core-api-endpoints)
6. [Deployment & Local Setup](#-deployment--local-setup)

---

## 🌐 System Overview

The platform bridges physical environmental sensors with a secure web backend, offering:
* **Real-time IoT Telemetry:** Ingests hardware alerts (gate sensors, soil moisture) and broadcasts them instantly to the admin dashboard via WebSockets.
* **Automated Ticketing Lifecycle:** Utilizes `node-cron` to automatically audit and expire out-of-date tickets, maintaining database hygiene.
* **Fault-Tolerant UI:** The React frontend implements isolated error boundaries to prevent cascading application failures if third-party modules timeout.
* **Cryptographic Identity Management:** Enforces stateless session validation using JSON Web Tokens (JWT) signed via HMAC-SHA256.

---

## 📊 Architectural Diagrams

### 1. High-Level Network Architecture
Demonstrates the separation of concerns between the public web interface, the API gateway security layer, and the core operational database.

```mermaid
graph TD
    subgraph Public Network Layer
        UI[React.js Client Application]
        IoT[Edge Sensor Nodes]
    end

    subgraph API Gateway & Defense Layer
        WAF[Rate Limiters & IP Blacklist]
        Auth[JWT Authentication]
        RBAC[Role-Based Access Control]
        Sanitizer[Payload Schema Validation]
    end

    subgraph Core Node.js Engine
        Controllers[Business Logic Controllers]
        Cron[Automated Ticket Cron Jobs]
        WS[WebSocket Broadcaster]
    end

    subgraph Persistence Layer
        DB[(MongoDB Atlas)]
    end

    UI -->|HTTPS Request| WAF
    WAF --> Auth
    Auth --> RBAC
    RBAC --> Sanitizer
    Sanitizer --> Controllers
    Controllers <--> DB
    Cron -->|State Updates| DB
    
    IoT -->|Sensor Telemetry| Controllers
    Controllers -->|Hardware Alerts| WS
    WS -->|WSS Real-Time| UI

```

### 2. Privilege Escalation Mitigation (Audit Logging)

Demonstrates the reactive defense mechanism when an unauthorized user attempts to access a Super-Admin route.

```mermaid
sequenceDiagram
    participant Attacker as Compromised Sub-Admin
    participant API as /api/v1/admin/config
    participant Middleware as superAdminMiddleware
    participant DB as MongoDB (AdminAuditLog)
    participant Socket as WebSocket Service
    participant SOC as Admin Dashboard

    Attacker->>API: PUT /config (JWT attached)
    API->>Middleware: Parse JWT & Verify Role
    Middleware-->>Middleware: Detect Role Mismatch!
    Middleware->>DB: Write Log (IP, Email, Payload, Failed)
    Middleware->>Socket: Emit 'auditLogUpdate'
    Socket->>SOC: Instant Threat Notification Rendered
    Middleware->>Attacker: HTTP 403 Forbidden (Connection Dropped)

```

---

## 🔒 Security Architecture & Threat Mitigation

The backend is engineered with a strict **Defense-in-Depth** methodology, heavily protected by specialized middleware pipelines before any data logic is executed.

### 1. Threat Mitigation Pipeline

* **`rateLimiters.js`**: Prevents volumetric abuse. Auth endpoints are blocked after 5 failed attempts per 15-minute window (`authLimiter`). Financial/Promo endpoints are restricted to 10 attempts per hour (`promoLimiter`).
* **`BannedIP.js`**: A database-driven reactive blacklist. Known malicious IPs are dynamically added and rejected at the gateway with an HTTP 403 status.
* **`validateRequest.js`**: Enforces strict schema rules on incoming JSON payloads to neutralize NoSQL injection attempts.

### 2. Multi-Tier Role-Based Access Control (RBAC)

* **`protect`**: Verifies cryptographic JWT signatures statelessly, rejecting tampered or expired tokens. Evaluates the `user.isRestricted` flag to instantly lock out compromised accounts.
* **`admin`**: Restricts access to standard operational routes (e.g., viewing user tickets, standard hardware alerts).
* **`requireSuperAdmin`**: Isolates critical infrastructure routes (e.g., system backups, config resets). Checks environmental variables against the user's validated email payload.

### 3. Immutable Security Forensics

All administrative configurations and failed privilege escalation attempts are written to the `AdminAuditLog` collection. This index tracks the user's email, source IP address, HTTP status code, and exact action payload to ensure absolute non-repudiation during incident response.

---

## 🗄️ Database Entity Relationship (ERD)

```mermaid
erDiagram
    USER ||--o{ TICKET : purchases
    USER ||--o{ OTP : generates
    USER {
        ObjectId _id
        String name
        String email
        String passwordHash
        String role "user | admin | sub-admin"
        Boolean isRestricted
    }
    
    PROMO_CODE ||--o{ TICKET : applied_to
    PROMO_CODE {
        ObjectId _id
        String code
        Number discountPercentage
        Date expirationDate
    }

    TICKET {
        ObjectId _id
        ObjectId userId
        String status "active | expired | scanned"
        Date validUntil
    }

    HARDWARE_ALERT {
        ObjectId _id
        String sensorId
        String alertType "moisture | motion | error"
        String severity "low | critical"
        Date timestamp
    }

    ADMIN_AUDIT_LOG {
        ObjectId _id
        String email
        String ipAddress
        String action
        String status "success | failed"
    }

```

---

## 📡 Core API Endpoints

| Target Route Controller | Endpoint Path | HTTP Method | Applied Security Middleware | Protection Objective |
| --- | --- | --- | --- | --- |
| **`authRoutes`** | `/api/v1/auth/login` | `POST` | `authLimiter` → `validateRequest` | Mitigates credential stuffing & injection. |
| **`otpRoutes`** | `/api/v1/otp/generate` | `POST` | `authLimiter` → `validateRequest` | Prevents API toll fraud / email bombing. |
| **`adminRoutes`** | `/api/v1/admin/config` | `PUT` | `protect` → `requireSuperAdmin` | Triggers `AdminAuditLog` on RBAC failure. |
| **`promoRoutes`** | `/api/v1/promo/verify` | `POST` | `promoLimiter` → `protect` | Stops automated promo code brute-forcing. |
| **`ticketRoutes`** | `/api/v1/tickets/issue` | `POST` | `protect` → `requireAdmin` | Secures the financial operational core. |
| **`state` (WSS)** | `wss://domain/state` | `WSS` | `jwtSocketHandshake` | Prevents unauthorized telemetry eavesdropping. |

---

## 🚀 Deployment & Local Setup

### Prerequisites

* Node.js (v20.x recommended)
* MongoDB Database (Local or Atlas)
* Git

### 1. Installation

Clone the repository and install dependencies for both microservices.

```bash
git clone [https://github.com/Ahmd-khld/smart-garden-iot-main.git](https://github.com/Ahmd-khld/smart-garden-iot-main.git)
cd smart-garden-iot-main

# Install Backend Dependencies
cd backend
npm install

# Install Frontend Dependencies
cd ../frontend
npm install

```

### 2. Environment Configuration

Navigate to the `backend/` directory and create a `.env` file based on the provided `.env.example`.

```env
PORT=5000
NODE_ENV=development
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=generate_a_secure_random_hash_64_chars_min
SUPER_ADMIN_EMAIL=admin@smartpark.com
EMAIL_SERVICE_KEY=your_email_provider_key

```

### 3. Execution

Start the API gateway and the React client concurrently.

```bash
# Terminal 1: Boot the backend API and WebSocket server
cd backend
npm run dev

# Terminal 2: Boot the Vite React application
cd frontend
npm run dev

```

```

```
