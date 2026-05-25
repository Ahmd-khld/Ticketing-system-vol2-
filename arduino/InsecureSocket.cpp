#include "InsecureSocket.h"

bool InsecureSocket::post(const char* host, int port, const char* path, const String& payload) {
    if (!_wifi.isConnected()) return false;
    flushSerial();

    String startCmd = "AT+CIPSTART=0,\"TCP\",\"";
    startCmd += host;
    startCmd += "\",";
    startCmd += port;

    // Try to connect, accept either OK or CONNECT as success
    _wifi.getSerial().println(startCmd);
    if (!waitForResponse("OK", 5000) && !waitForResponse("CONNECT", 2000)) {
        Serial.println(F("[Socket] TCP Connection Failed"));
        return false;
    }

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

    if (sendAT(sendCmd, ">", 3000)) {
        _wifi.getSerial().print(httpRequest);
        bool success = waitForResponse("200 OK", 5000);
        if (!success) Serial.println(F("[Socket] HTTP 200 Not Received"));
        sendAT(F("AT+CIPCLOSE=0"), "OK", 2000);
        return success;
    }

    sendAT(F("AT+CIPCLOSE=0"), "OK", 1000);
    return false;
}

String InsecureSocket::listen() {
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
