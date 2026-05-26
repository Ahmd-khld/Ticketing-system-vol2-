#include "SecureSocket.h"

bool SecureSocket::post(const char* host, int port, const char* path, const String& payload) {
    if (!_wifi.isConnected()) return false;
    flushSerial();

    // Set SSL buffer size if needed (common for ESP8266)
    String sslSizeCmd = "AT+CIPSSLSIZE=";
    sslSizeCmd += SSL_BUFFER_SIZE;
    sendAT(sslSizeCmd, "OK");

    String startCmd = "AT+CIPSTART=0,\"SSL\",\"";
    startCmd += host;
    startCmd += "\",";
    startCmd += port;

    if (!sendAT(startCmd, "CONNECT", 10000)) return false;

    String signedPayload = signPayload(payload);

    String httpRequest = "POST ";
    httpRequest += path;
    httpRequest += " HTTP/1.1\r\nHost: ";
    httpRequest += host;
    httpRequest += "\r\nContent-Type: application/json\r\nContent-Length: ";
    httpRequest += signedPayload.length();
    httpRequest += "\r\nConnection: close\r\n\r\n";
    httpRequest += signedPayload;

    String sendCmd = "AT+CIPSEND=0,";
    sendCmd += httpRequest.length();

    if (sendAT(sendCmd, ">", 2000)) {
        Serial.println(F("[Network] Sending HTTPS Request:"));
        Serial.println(httpRequest);
        _wifi.getSerial().print(httpRequest);
        bool success = waitForResponse("200 OK", 5000);
        sendAT(F("AT+CIPCLOSE=0"), "OK", 1000);
        return success;
    }

    sendAT(F("AT+CIPCLOSE=0"), "OK", 1000);
    return false;
}

String SecureSocket::listen() {
    // SSL listening is rarely used on client-side Arduino, 
    // but we implement it for consistency.
    if (_wifi.getSerial().available()) {
        if (_wifi.getSerial().find("+IPD,")) {
            int linkId = _wifi.getSerial().parseInt();
            if (_wifi.getSerial().find(":")) {
                String cmd = _wifi.getSerial().readStringUntil('\n');
                cmd.trim();
                String closeCmd = "AT+CIPCLOSE=";
                closeCmd += linkId;
                sendAT(closeCmd, "OK", 500);
                return cmd;
            }
        }
    }
    return "";
}
