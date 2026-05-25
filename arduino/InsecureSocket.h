#ifndef INSECURE_SOCKET_H
#define INSECURE_SOCKET_H

#include "NetworkSocket.h"

/**
 * @class InsecureSocket
 * @brief HTTP implementation for debug fallback.
 */
class InsecureSocket : public NetworkSocket {
public:
    InsecureSocket(WiFiModule& wifi) : NetworkSocket(wifi) {}
    
    bool post(const char* host, int port, const char* path, const String& payload) override;
    String listen() override;
};

#endif // INSECURE_SOCKET_H
