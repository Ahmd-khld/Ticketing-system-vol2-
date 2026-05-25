#include "NetworkSocket.h"

bool NetworkSocket::sendAT(const String& cmd, const char* expected, unsigned long timeout) {
    flushSerial();
    _wifi.getSerial().println(cmd);
    return waitForResponse(expected, timeout);
}

bool NetworkSocket::waitForResponse(const char* expected, unsigned long timeout) {
    unsigned long start = millis();
    while (millis() - start < timeout) {
        if (_wifi.getSerial().find((char*)expected)) {
            return true;
        }
    }
    return false;
}

void NetworkSocket::flushSerial() {
    while (_wifi.getSerial().available()) {
        _wifi.getSerial().read();
    }
}

String NetworkSocket::signPayload(const String& payload) {
    // Simplified "digital signature" using AES key (HMAC-like logic placeholder)
    return payload + "|sig:" + String(ARDUINO_AES_KEY).substring(0, 8);
}
