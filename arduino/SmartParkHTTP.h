#ifndef SMART_PARK_HTTP_H
#define SMART_PARK_HTTP_H

#include <Arduino.h>
#include <SoftwareSerial.h>

/**
 * @class SmartParkHTTP
 * @brief A robust wrapper for ESP8266 AT commands to handle WiFi and HTTP POST requests.
 */
class SmartParkHTTP {
public:
    /**
     * @brief Construct a new SmartParkHTTP object.
     * @param serial Reference to the SoftwareSerial or HardwareSerial connected to the ESP8266.
     */
    SmartParkHTTP(Stream& serial);

    /**
     * @brief Initialize the ESP8266 and connect to WiFi.
     * @param ssid WiFi Network Name.
     * @param pass WiFi Password.
     * @return true if successfully connected and obtained an IP.
     */
    bool connectWiFi(const char* ssid, const char* pass);

    /**
     * @brief Send an HTTP POST request with a JSON payload.
     * @param host Server IP or domain.
     * @param port Server port (e.g., 5000).
     * @param path API endpoint path (e.g., "/api/hardware/telemetry").
     * @param payload JSON string to send.
     * @return true if the request was successful (HTTP 200 OK received).
     */
    bool post(const char* host, int port, const char* path, const String& payload);

    /**
     * @brief Listen for incoming commands from the server (if CIPSERVER is active).
     * @return The received command string, or empty if none.
     */
    String listenForCommands();

private:
    Stream& _serial;
    
    bool sendAT(const String& cmd, const char* expected, unsigned long timeout = 1000);
    void flushSerial();
    bool waitForResponse(const char* expected, unsigned long timeout);
};

#endif // SMART_PARK_HTTP_H
