#include "NetworkSocket.h"

bool NetworkSocket::sendAT(const String& cmd, const char* expected, unsigned long timeout) {
    flushSerial();
    Serial.print(F("[Network] Sending AT: "));
    Serial.println(cmd);
    _wifi.getSerial().println(cmd);
    bool result = waitForResponse(expected, timeout);
    if (!result) {
        Serial.print(F("[Socket] AT Failure: "));
        Serial.print(cmd);
        Serial.print(F(" -> Expected: "));
        Serial.println(expected);
    }
    return result;
}

bool NetworkSocket::waitForResponse(const char* expected, unsigned long timeout) {
    unsigned long start = millis();
    String response = "";
    while (millis() - start < timeout) {
        if (_wifi.getSerial().available()) {
            char c = _wifi.getSerial().read();
            response += c;
            if (response.endsWith(expected)) {
                return true;
            }
        }
    }
    if (response.length() > 0) {
        Serial.print(F("[Network] ERROR: Timeout waiting for '"));
        Serial.print(expected);
        Serial.println(F("'. Received:"));
        Serial.println(response);
    } else {
        Serial.print(F("[Network] ERROR: No response for '"));
        Serial.print(expected);
        Serial.println(F("'"));
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
