#ifndef PERIPHERAL_INTERFACE_H
#define PERIPHERAL_INTERFACE_H

#include <Arduino.h>
#include <Servo.h>
#include <DHT.h>
#include "TelemetryPacket.h"

/**
 * @class PeripheralInterface
 * @brief Handles all hardware-level interactions with sensors and actuators.
 */
class PeripheralInterface {
private:
  // Pin Definitions
  static const int PIN_MOISTURE = A0;
  static const int PIN_PUMP = 7;
  static const int PIN_RGB_TRIG = 9;
  static const int PIN_RGB_ECHO = 10;
  static const int PIN_RGB_R = 11;
  static const int PIN_RGB_G = 6;
  static const int PIN_RGB_B = 5;
  static const int PIN_LDR_DO = 8;
  static const int PIN_LDR_LED = 12;
  static const int PIN_GATE_TRIG = 2;
  static const int PIN_GATE_ECHO = 3;
  static const int PIN_GATE_SERVO = 4;
  static const int PIN_DHT = 13;

  // Thresholds
  static const int DRY_THRESHOLD = 500;
  static const int HUMIDITY_THRESHOLD = 60;
  static const int TEMP_THRESHOLD = 30;
  static const int GATE_DETECTION_THRESHOLD = 7;
  static const unsigned long GATE_HOLD_DURATION = 2000;

  Servo gateServo;
  DHT dht;

  bool _gateActive = false;
  unsigned long _gateActiveTime = 0;
  int _gatePos = 0;
  int _lastRGBBand = -1;

public:
  // Manual Overrides
  bool manualGateOverride = false;
  bool manualLampOverride = false;
  bool manualPumpOverride = false;
  bool manualRGBOverride = false;

  PeripheralInterface();
  void begin();
  
  // Actuators
  void setGate(bool open);
  void setPump(bool on);
  void setLamp(bool on);
  void setRGB(uint8_t r, uint8_t g, uint8_t b);

  // Sensors
  int readMoisture();
  int readRGBDistance();
  float readGateDistance();

  // Logic
  void runAutomation();
  TelemetryPacket captureTelemetry();
};

#endif // PERIPHERAL_INTERFACE_H
