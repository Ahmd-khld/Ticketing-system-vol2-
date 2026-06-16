#ifndef CONSTANTS_H
#define CONSTANTS_H

/**
 * Smart Park IoT - System Constants
 * 
 * This file contains network credentials, server settings, 
 * and security keys used across the Arduino firmware.
 */

// WiFi Credentials
#define WIFI_SSID "test"
#define WIFI_PASS "12345678"

// Server Configuration
#define SERVER_IP "192.168.137.1"
#define SERVER_PORT_HTTP 5000
#define SERVER_PORT_HTTPS 443

// System Parameters
#define TELEMETRY_INTERVAL 1000 // Transmission every 1 second (ms)
#define SSL_BUFFER_SIZE 2048     // ESP8266 SSL buffer

// Security Keys
// ARDUINO_AES_KEY: 16-byte key used for payload signing
#define ARDUINO_AES_KEY "ENCRYPTION_KEY16" 

#endif // CONSTANTS_H
