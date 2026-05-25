#include <SoftwareSerial.h>
#include "SmartParkHTTP.h"
#include "PeripheralInterface.h"
#include "RuntimeDispatcher.h"

/**
 * Smart Park IoT Node - Entry Point
 * 
 * This firmware uses a tiered architecture:
 * 1. PeripheralInterface: Manages hardware I/O and local automation.
 * 2. RuntimeDispatcher: Coordinates networking and remote command routing.
 * 3. SmartParkHTTP: Abstracted AT command set for ESP8266 communication.
 */

// Hardware Serial communication for the ESP8266 module
SoftwareSerial espSerial(A4, A5); // RX (to ESP TX), TX (to ESP RX)

// Shared instances
SmartParkHTTP network(espSerial);
PeripheralInterface peripherals;
RuntimeDispatcher systemRuntime(network, peripherals);

/**
 * Standard Arduino setup entry point.
 */
void setup() {
  // Initialize debugging serial
  Serial.begin(9600);
  
  // Initialize ESP8266 serial link
  espSerial.begin(9600);
  
  // Hand over control to the runtime orchestrator
  systemRuntime.setup();
}

/**
 * Standard Arduino loop entry point.
 */
void loop() {
  // Continuous execution managed by the dispatcher
  systemRuntime.loop();
}
