#ifndef RUNTIME_DISPATCHER_H
#define RUNTIME_DISPATCHER_H

#include <Arduino.h>
#include "constants.h"
#include "WiFiModule.h"
#include "NetworkSocket.h"
#include "PeripheralInterface.h"

/**
 * @class RuntimeDispatcher
 * @brief Orchestrates the system loop, network communication, and remote command routing.
 */
class RuntimeDispatcher {
private:
  WiFiModule& _wifi;
  NetworkSocket& _net;
  PeripheralInterface& _peripherals;
  
  unsigned long _lastTelemetry = 0;
  bool _debugMode;

  void processCommand(const String& cmd);
  void dispatchTelemetry();

public:
  RuntimeDispatcher(WiFiModule& wifi, NetworkSocket& net, PeripheralInterface& peripherals, bool debug = false);
  
  void setup();
  void loop();
};

#endif // RUNTIME_DISPATCHER_H
