#ifndef TELEMETRY_PACKET_H
#define TELEMETRY_PACKET_H

/**
 * @struct TelemetryPacket
 * @brief Standardized data structure for IoT sensor readings across the Smart Park.
 */
struct TelemetryPacket {
  int moisture;
  float humidity;
  float temperature;
  int rgbDistance;
  float servoDistance;
  bool ldrStatus;
  bool pumpStatus;
  bool gateStatus;
};

#endif // TELEMETRY_PACKET_H
