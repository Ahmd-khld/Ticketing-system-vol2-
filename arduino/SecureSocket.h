#ifndef SECURE_SOCKET_H
#define SECURE_SOCKET_H

#include "NetworkSocket.h"

/**
 * @class SecureSocket
 * @brief HTTPS implementation using SSL AT commands.
 */
class SecureSocket : public NetworkSocket {
public:
    SecureSocket(WiFiModule& wifi) : NetworkSocket(wifi) {}
    
    bool post(const char* host, int port, const char* path, const String& payload) override;
    String listen() override;
};

#endif // SECURE_SOCKET_H
