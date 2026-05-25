#ifndef NETWORK_SOCKET_H
#define NETWORK_SOCKET_H

#include <Arduino.h>
#include "constants.h"
#include "WiFiModule.h"

/**
 * @class NetworkSocket
 * @brief Abstract interface for network communication, owning a WiFiModule.
 */
class NetworkSocket {
protected:
    WiFiModule& _wifi;
    
    bool sendAT(const String& cmd, const char* expected, unsigned long timeout = 1000);
    bool waitForResponse(const char* expected, unsigned long timeout);
    void flushSerial();

public:
    NetworkSocket(WiFiModule& wifi) : _wifi(wifi) {}
    virtual ~NetworkSocket() {}

    virtual bool post(const char* host, int port, const char* path, const String& payload) = 0;
    virtual String listen() = 0;
    
    // Auth helper
    String signPayload(const String& payload);
};

#endif // NETWORK_SOCKET_H
