#include "RuntimeDispatcher.h"

// Define static members (Configuration)
const char* RuntimeDispatcher::WIFI_SSID = "test";
const char* RuntimeDispatcher::WIFI_PASS = "12345678";
const char* RuntimeDispatcher::SERVER_IP = "192.168.137.1";

RuntimeDispatcher::RuntimeDispatcher(SmartParkHTTP& net, PeripheralInterface& peripherals) 
  : _net(net), _peripherals(peripherals) {}

void RuntimeDispatcher::setup() {
  Serial.println(F("[Runtime] Initializing system..."));
  _peripherals.begin();
  
  if (_net.connectWiFi(WIFI_SSID, WIFI_PASS)) {
    Serial.println(F("[Runtime] Network connection established."));
  } else {
    Serial.println(F("[Runtime] CRITICAL: WiFi negotiation failed."));
  }
}

void RuntimeDispatcher::loop() {
  // 1. Ingest remote commands
  String cmd = _net.listenForCommands();
  if (cmd.length() > 0) {
    processCommand(cmd);
  }

  // 2. Execute local logic
  _peripherals.runAutomation();

  // 3. Dispatch telemetry packets
  if (millis() - _lastTelemetry >= TELEMETRY_INTERVAL) {
    _lastTelemetry = millis();
    dispatchTelemetry();
  }
}

void RuntimeDispatcher::processCommand(const String& cmd) {
  Serial.print(F("[Dispatcher] Command Received: "));
  Serial.println(cmd);

  if (cmd.indexOf("SERVO_ON") >= 0) {
    _peripherals.setGate(true);
    _peripherals.manualGateOverride = true;
  } 
  else if (cmd.indexOf("SERVO_OFF") >= 0) {
    _peripherals.setGate(false);
    _peripherals.manualGateOverride = true;
  }
  else if (cmd.indexOf("SERVO_AUTO") >= 0) {
    _peripherals.manualGateOverride = false;
  }
  else if (cmd.indexOf("LAMP_ON") >= 0) {
    _peripherals.setLamp(true);
    _peripherals.manualLampOverride = true;
  }
  else if (cmd.indexOf("LAMP_OFF") >= 0) {
    _peripherals.setLamp(false);
    _peripherals.manualLampOverride = false;
  }
}

void RuntimeDispatcher::dispatchTelemetry() {
  TelemetryPacket data = _peripherals.captureTelemetry();
  
  String json = "{";
  json += "\"moisture\":" + String(data.moisture) + ",";
  json += "\"humidity\":" + String(data.humidity) + ",";
  json += "\"temperature\":" + String(data.temperature) + ",";
  json += "\"rgbDistance\":" + String(data.rgbDistance) + ",";
  json += "\"servoDistance\":" + String(data.servoDistance) + ",";
  json += "\"ldrStatus\":\"" + String(data.ldrStatus ? "ON" : "OFF") + "\",";
  json += "\"pumpStatus\":\"" + String(data.pumpStatus ? "ON" : "OFF") + "\",";
  json += "\"servoStatus\":\"" + String(data.gateStatus ? "OPEN" : "CLOSED") + "\"";
  json += "}";

  Serial.println(F("[Runtime] Transmitting telemetry packet..."));
  if (_net.post(SERVER_IP, SERVER_PORT, "/api/hardware/telemetry", json)) {
    Serial.println(F("[Runtime] SUCCESS: Telemetry ACK received."));
  } else {
    Serial.println(F("[Runtime] ERROR: Transmission failed."));
  }
}
