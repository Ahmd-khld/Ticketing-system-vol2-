#include <SoftwareSerial.h>
#include "WiFiModule.h"
#include "SecureSocket.h"
#include "InsecureSocket.h"
#include "PeripheralInterface.h"
#include "RuntimeDispatcher.h"

/**
 * Smart Park IoT Node - Entry Point
 * 
 * This firmware uses a tiered architecture:
 * 1. PeripheralInterface: Manages hardware I/O and local automation.
 * 2. RuntimeDispatcher: Coordinates networking and remote command routing.
 * 3. WiFiModule: Manages WiFi connection state.
 * 4. NetworkSocket: Abstracted communication (Secure/Insecure).
 */

// Debug flag: true uses HTTP (port 5000), false uses HTTPS (port 443)
bool DEBUG_MODE = true;

// Hardware Serial communication for the ESP8266 module
SoftwareSerial espSerial(A4, A5); // RX (to ESP TX), TX (to ESP RX)

// Shared instances
WiFiModule wifi(espSerial);
PeripheralInterface peripherals;

// Polymorphic socket choice
#ifdef USE_INSECURE
InsecureSocket socket_impl(wifi);
#else
SecureSocket socket_impl(wifi);
#endif

// We use pointers/references to handle the conditional socket implementation
NetworkSocket* activeSocket;
RuntimeDispatcher* systemRuntime;

/**
 * Standard Arduino setup entry point.
 */
void setup() {
  Serial.begin(9600);
  espSerial.begin(9600);

  // Initialize socket implementation based on mode
  if (DEBUG_MODE) {
    activeSocket = new InsecureSocket(wifi);
  } else {
    activeSocket = new SecureSocket(wifi);
  }

  systemRuntime = new RuntimeDispatcher(wifi, *activeSocket, peripherals, DEBUG_MODE);
  
  // Hand over control to the runtime orchestrator
  systemRuntime->setup();
}

/**
 * Standard Arduino loop entry point.
 */
void loop() {
  systemRuntime->loop();
}
