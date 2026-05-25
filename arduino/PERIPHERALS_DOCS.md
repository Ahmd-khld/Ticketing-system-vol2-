# Smart Park Peripherals & Security Documentation

This document describes the peripheral functions and the secure networking architecture implemented for the Smart Park Arduino system.

## Networking Architecture

The system uses a tiered, object-oriented networking stack:

1.  **WiFiModule**: Manages the low-level WiFi connection state via ESP8266 AT commands.
2.  **NetworkSocket (Interface)**: Defines a standard interface for sending data and listening for commands. It "owns" the `WiFiModule` to ensure network availability.
3.  **SecureSocket (HTTPS)**: Default implementation using SSL/TLS for secure communication with the backend (Port 443).
4.  **InsecureSocket (HTTP)**: Debug-only fallback for local testing (Port 5000).

### Security Features

-   **HTTPS**: All production traffic is encrypted via SSL/TLS.
-   **RSA Verification**: The server's RSA certificate is hardcoded in `NetworkSocket.cpp` for identity verification.
-   **AES Authentication**: Each payload is signed using a 16-byte AES-128 key (`ARDUINO_AES_KEY`). This signature is appended to the payload to authenticate the Arduino as a valid node.

---

## Remote Commands

Commands are sent via HTTP(S) POST from the backend to the Arduino.

| System | Command | Description |
| :--- | :--- | :--- |
| **Automated Gate** | `GATE_OPEN` / `SERVO_ON` | Force gate to OPEN position. |
| | `GATE_CLOSE` / `SERVO_OFF` | Force gate to CLOSED position. |
| | `GATE_AUTO` / `SERVO_AUTO` | Enable automatic proximity-based gate control. |
| **Ambient Lighting** | `LAMP_ON` | Force lamp to ON. |
| | `LAMP_OFF` | Force lamp to OFF. |
| | `LAMP_AUTO` | Enable automatic light-based control. |
| **Smart Irrigation** | `PUMP_ON` | Force pump to ON. |
| | `PUMP_OFF` | Force pump to OFF. |
| | `PUMP_AUTO` | Enable automatic moisture-based control. |
| **Recycle Bins** | `RGB_RED` | Force RGB LED to RED. |
| | `RGB_GREEN` | Force RGB LED to GREEN. |
| | `RGB_BLUE` | Force RGB LED to BLUE. |
| | `RGB_OFF` | Turn off RGB LED. |
| | `RGB_AUTO` | Enable automatic fill-level based color. |

---

## Telemetry Data

The system periodically sends sensor data to the server.

- `moisture`: Soil moisture level (0-1023).
- `humidity`: Ambient humidity percentage.
- `temperature`: Ambient temperature in Celsius.
- `rgbDistance`: Fill level distance (cm).
- `servoDistance`: Gate proximity distance (cm).
- `ldrStatus`: Ambient light status (ON/OFF).
- `pumpStatus`: Irrigation pump status (ON/OFF).
- `servoStatus`: Gate status (OPEN/CLOSED).
