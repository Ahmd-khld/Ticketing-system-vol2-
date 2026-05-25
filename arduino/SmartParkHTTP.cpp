#include "SmartParkHTTP.h"

SmartParkHTTP::SmartParkHTTP(Stream& serial) : _serial(serial) {
    _serial.setTimeout(1000);
}

bool SmartParkHTTP::connectWiFi(const char* ssid, const char* pass) {
    Serial.println(F("[WiFi] Resetting ESP8266..."));
    sendAT(F("AT+RST"), "OK", 3000);
    delay(1000);
    flushSerial();

    if (!sendAT(F("AT+CWMODE=1"), "OK")) return false;
    if (!sendAT(F("AT+CIPMUX=1"), "OK")) return false;

    Serial.print(F("[WiFi] Connecting to: "));
    Serial.println(ssid);

    String cmd = "AT+CWJAP=\"";
    cmd += ssid;
    cmd += "\",\"";
    cmd += pass;
    cmd += "\"";

    if (sendAT(cmd, "WIFI GOT IP", 15000)) {
        Serial.println(F("[WiFi] Connected!"));
        sendAT(F("AT+CIFSR"), "OK", 1000); // Show IP in Serial Monitor
        
        // Start server on port 80 for remote commands
        sendAT(F("AT+CIPSERVER=1,80"), "OK", 2000);
        return true;
    }

    Serial.println(F("[WiFi] Connection Failed."));
    return false;
}

bool SmartParkHTTP::post(const char* host, int port, const char* path, const String& payload) {
    flushSerial();

    // 1. Establish TCP Connection
    String startCmd = "AT+CIPSTART=0,\"TCP\",\"";
    startCmd += host;
    startCmd += "\",";
    startCmd += port;

    if (!sendAT(startCmd, "CONNECT", 5000)) {
        Serial.println(F("[HTTP] TCP Connection Failed"));
        return false;
    }

    // 2. Prepare HTTP Request
    String httpRequest = "POST ";
    httpRequest += path;
    httpRequest += " HTTP/1.1\r\n";
    httpRequest += "Host: ";
    httpRequest += host;
    httpRequest += "\r\n";
    httpRequest += "Content-Type: application/json\r\n";
    httpRequest += "Content-Length: ";
    httpRequest += payload.length();
    httpRequest += "\r\n";
    httpRequest += "Connection: close\r\n\r\n";
    httpRequest += payload;

    // 3. Send Request
    String sendCmd = "AT+CIPSEND=0,";
    sendCmd += httpRequest.length();

    if (sendAT(sendCmd, ">", 2000)) {
        _serial.print(httpRequest);
        bool success = waitForResponse("200 OK", 3000);
        
        // Close connection explicitly
        sendAT(F("AT+CIPCLOSE=0"), "OK", 1000);
        return success;
    }

    sendAT(F("AT+CIPCLOSE=0"), "OK", 1000);
    return false;
}

String SmartParkHTTP::listenForCommands() {
    if (_serial.available()) {
        if (_serial.find("+IPD,")) {
            int linkId = _serial.parseInt();
            if (_serial.find(":")) {
                String cmd = _serial.readStringUntil('\n');
                cmd.trim();
                
                // Close the specific link to free resources
                String closeCmd = "AT+CIPCLOSE=";
                closeCmd += linkId;
                sendAT(closeCmd, "OK", 500);
                
                return cmd;
            }
        }
    }
    return "";
}

bool SmartParkHTTP::sendAT(const String& cmd, const char* expected, unsigned long timeout) {
    flushSerial();
    _serial.println(cmd);
    return waitForResponse(expected, timeout);
}

bool SmartParkHTTP::waitForResponse(const char* expected, unsigned long timeout) {
    unsigned long start = millis();
    while (millis() - start < timeout) {
        if (_serial.find((char*)expected)) {
            return true;
        }
    }
    return false;
}

void SmartParkHTTP::flushSerial() {
    while (_serial.available()) {
        _serial.read();
    }
}
