#ifndef RUNTIME_DISPATCHER_H
#define RUNTIME_DISPATCHER_H

#include <Arduino.h>
#include "SmartParkHTTP.h"
#include "PeripheralInterface.h"

/**
 * @class RuntimeDispatcher
 * @brief Orchestrates the system loop, network communication, and remote command routing.
 */
class RuntimeDispatcher {
private:
  SmartParkHTTP& _net;
  PeripheralInterface& _peripherals;
  
  unsigned long _lastTelemetry = 0;
  static const unsigned long TELEMETRY_INTERVAL = 2000;
  
  static const char* WIFI_SSID;
  static const char* WIFI_PASS;
  static const char* SERVER_IP;
  static const int SERVER_PORT = 5000;

  void processCommand(const String& cmd);
  void dispatchTelemetry();

public:
  RuntimeDispatcher(SmartParkHTTP& net, PeripheralInterface& peripherals);
  
  void setup();
  void loop();
};

#endif // RUNTIME_DISPATCHER_H
