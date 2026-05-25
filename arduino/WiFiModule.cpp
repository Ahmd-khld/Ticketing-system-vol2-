#include "WiFiModule.h"

WiFiModule::WiFiModule(Stream& serial) : _serial(serial) {
    _serial.setTimeout(1000);
}

void WiFiModule::reset() {
    Serial.println(F("[WiFi] Resetting ESP8266..."));
    sendAT(F("AT+RST"), "OK", 3000);
    delay(1000);
    flushSerial();
    _connected = false;
}

bool WiFiModule::begin(const char* ssid, const char* pass) {
    reset();

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
        sendAT(F("AT+CIFSR"), "OK", 1000);
        _connected = true;
        return true;
    }

    Serial.println(F("[WiFi] CRITICAL: Failed to connect to WiFi."));
    return false;
}

bool WiFiModule::sendAT(const String& cmd, const char* expected, unsigned long timeout) {
    flushSerial();
    Serial.print(F("[WiFi] Sending AT: "));
    Serial.println(cmd);
    _serial.println(cmd);
    return waitForResponse(expected, timeout);
}

bool WiFiModule::waitForResponse(const char* expected, unsigned long timeout) {
    unsigned long start = millis();
    String response = "";
    while (millis() - start < timeout) {
        if (_serial.available()) {
            char c = _serial.read();
            response += c;
            if (response.endsWith(expected)) {
                return true;
            }
        }
    }
    if (response.length() > 0) {
        Serial.print(F("[WiFi] ERROR: Timeout waiting for '"));
        Serial.print(expected);
        Serial.println(F("'. Received:"));
        Serial.println(response);
    } else {
        Serial.print(F("[WiFi] ERROR: No response for '"));
        Serial.print(expected);
        Serial.println(F("'"));
    }
    return false;
}

void WiFiModule::flushSerial() {
    while (_serial.available()) {
        _serial.read();
    }
}
