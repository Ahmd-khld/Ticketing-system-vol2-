#ifndef WIFI_MODULE_H
#define WIFI_MODULE_H

#include <Arduino.h>

/**
 * @class WiFiModule
 * @brief Manages the ESP8266 WiFi connection state.
 */
class WiFiModule {
private:
    Stream& _serial;
    bool _connected = false;

    bool sendAT(const String& cmd, const char* expected, unsigned long timeout = 1000);
    void flushSerial();
    bool waitForResponse(const char* expected, unsigned long timeout);

public:
    WiFiModule(Stream& serial);
    bool begin(const char* ssid, const char* pass);
    bool isConnected() const { return _connected; }
    void reset();
    Stream& getSerial() { return _serial; }
};

#endif // WIFI_MODULE_H
