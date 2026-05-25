#include "RuntimeDispatcher.h"

RuntimeDispatcher::RuntimeDispatcher(WiFiModule& wifi, NetworkSocket& net, PeripheralInterface& peripherals, bool debug) 
  : _wifi(wifi), _net(net), _peripherals(peripherals), _debugMode(debug) {}

void RuntimeDispatcher::setup() {
  Serial.println(F("[Runtime] Initializing system..."));
  _peripherals.begin();
  
  if (_wifi.begin(WIFI_SSID, WIFI_PASS)) {
    Serial.println(F("[Runtime] Network connection established."));
  } else {
    Serial.println(F("[Runtime] CRITICAL: WiFi negotiation failed."));
  }
}

void RuntimeDispatcher::loop() {
  // 1. Ingest remote commands
  String cmd = _net.listen();
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

  // Automated Gate
  if (cmd.indexOf("GATE_OPEN") >= 0 || cmd.indexOf("SERVO_ON") >= 0) {
    _peripherals.setGate(true);
    _peripherals.manualGateOverride = true;
  } 
  else if (cmd.indexOf("GATE_CLOSE") >= 0 || cmd.indexOf("SERVO_OFF") >= 0) {
    _peripherals.setGate(false);
    _peripherals.manualGateOverride = true;
  }
  else if (cmd.indexOf("GATE_AUTO") >= 0 || cmd.indexOf("SERVO_AUTO") >= 0) {
    _peripherals.manualGateOverride = false;
  }

  // Ambient Lighting
  else if (cmd.indexOf("LAMP_ON") >= 0) {
    _peripherals.setLamp(true);
    _peripherals.manualLampOverride = true;
  }
  else if (cmd.indexOf("LAMP_OFF") >= 0) {
    _peripherals.setLamp(false);
    _peripherals.manualLampOverride = true;
  }
  else if (cmd.indexOf("LAMP_AUTO") >= 0) {
    _peripherals.manualLampOverride = false;
  }

  // Smart Irrigation
  else if (cmd.indexOf("PUMP_ON") >= 0) {
    _peripherals.setPump(true);
    _peripherals.manualPumpOverride = true;
  }
  else if (cmd.indexOf("PUMP_OFF") >= 0) {
    _peripherals.setPump(false);
    _peripherals.manualPumpOverride = true;
  }
  else if (cmd.indexOf("PUMP_AUTO") >= 0) {
    _peripherals.manualPumpOverride = false;
  }

  // Smart Recycle Bins (RGB)
  else if (cmd.indexOf("RGB_RED") >= 0) {
    _peripherals.setRGB(255, 0, 0);
    _peripherals.manualRGBOverride = true;
  }
  else if (cmd.indexOf("RGB_GREEN") >= 0) {
    _peripherals.setRGB(0, 255, 0);
    _peripherals.manualRGBOverride = true;
  }
  else if (cmd.indexOf("RGB_BLUE") >= 0) {
    _peripherals.setRGB(0, 0, 255);
    _peripherals.manualRGBOverride = true;
  }
  else if (cmd.indexOf("RGB_OFF") >= 0) {
    _peripherals.setRGB(0, 0, 0);
    _peripherals.manualRGBOverride = true;
  }
  else if (cmd.indexOf("RGB_AUTO") >= 0) {
    _peripherals.manualRGBOverride = false;
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
  
  int port = _debugMode ? SERVER_PORT_HTTP : SERVER_PORT_HTTPS;
  if (_net.post(SERVER_IP, port, "/api/hardware/telemetry", json)) {
    Serial.println(F("[Runtime] SUCCESS: Telemetry ACK received."));
  } else {
    Serial.println(F("[Runtime] ERROR: Transmission failed."));
  }
}
