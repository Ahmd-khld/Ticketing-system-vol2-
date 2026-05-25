#include "PeripheralInterface.h"

PeripheralInterface::PeripheralInterface() : dht(PIN_DHT, DHT11) {}

void PeripheralInterface::begin() {
  pinMode(PIN_PUMP, OUTPUT);
  digitalWrite(PIN_PUMP, LOW);
  
  pinMode(PIN_RGB_TRIG, OUTPUT);
  pinMode(PIN_RGB_ECHO, INPUT);
  pinMode(PIN_RGB_R, OUTPUT);
  pinMode(PIN_RGB_G, OUTPUT);
  pinMode(PIN_RGB_B, OUTPUT);
  setRGB(0, 0, 0);

  pinMode(PIN_LDR_DO, INPUT);
  pinMode(PIN_LDR_LED, OUTPUT);
  digitalWrite(PIN_LDR_LED, LOW);

  pinMode(PIN_GATE_TRIG, OUTPUT);
  pinMode(PIN_GATE_ECHO, INPUT);
  gateServo.attach(PIN_GATE_SERVO);
  gateServo.write(0);

  dht.begin();
}

void PeripheralInterface::setGate(bool open) {
  _gatePos = open ? 90 : 0;
  gateServo.write(_gatePos);
}

void PeripheralInterface::setPump(bool on) {
  digitalWrite(PIN_PUMP, on ? HIGH : LOW);
}

void PeripheralInterface::setLamp(bool on) {
  digitalWrite(PIN_LDR_LED, on ? HIGH : LOW);
}

void PeripheralInterface::setRGB(uint8_t r, uint8_t g, uint8_t b) {
  analogWrite(PIN_RGB_R, r);
  analogWrite(PIN_RGB_G, g);
  analogWrite(PIN_RGB_B, b);
}

int PeripheralInterface::readMoisture() {
  analogRead(PIN_MOISTURE);
  delayMicroseconds(150);
  int readings[5];
  for(int i=0; i<5; i++) readings[i] = analogRead(PIN_MOISTURE);
  for(int i=0; i<4; i++) {
    for(int j=i+1; j<5; j++) {
      if(readings[i] > readings[j]) {
        int tmp = readings[i]; readings[i] = readings[j]; readings[j] = tmp;
      }
    }
  }
  return readings[2];
}

int PeripheralInterface::readRGBDistance() {
  digitalWrite(PIN_RGB_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_RGB_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_RGB_TRIG, LOW);
  long t = pulseIn(PIN_RGB_ECHO, HIGH, 30000UL);
  return (t == 0) ? -1 : (int)(t * 0.034 / 2.0);
}

float PeripheralInterface::readGateDistance() {
  digitalWrite(PIN_GATE_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_GATE_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_GATE_TRIG, LOW);
  long t = pulseIn(PIN_GATE_ECHO, HIGH, 30000UL);
  return (t == 0) ? -1 : (t * 0.034) / 2.0;
}

void PeripheralInterface::runAutomation() {
  if (!manualLampOverride) {
    digitalWrite(PIN_LDR_LED, digitalRead(PIN_LDR_DO));
  }

  int d = readRGBDistance();
  int band = (d < 0) ? -1 : (d <= 5 ? 0 : (d <= 10 ? 1 : 2));
  if (band != _lastRGBBand) {
    if(band == 0) setRGB(255, 0, 0);
    else if(band == 1) setRGB(255, 255, 0);
    else if(band == 2) setRGB(0, 255, 0);
    _lastRGBBand = band;
  }

  int m = readMoisture();
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (m > 0 && m < 1023) {
    if (m > DRY_THRESHOLD || (h < HUMIDITY_THRESHOLD && t > TEMP_THRESHOLD)) {
      setPump(true);
    } else {
      setPump(false);
    }
  }

  if (!manualGateOverride) {
    float dist = readGateDistance();
    if (dist > 0 && dist < GATE_DETECTION_THRESHOLD) {
      if (!_gateActive) {
        setGate(true);
        _gateActive = true;
      }
      _gateActiveTime = millis();
    }
    if (_gateActive && millis() - _gateActiveTime >= GATE_HOLD_DURATION) {
      setGate(false);
      _gateActive = false;
    }
  }
}

TelemetryPacket PeripheralInterface::captureTelemetry() {
  return {
    readMoisture(),
    dht.readHumidity(),
    dht.readTemperature(),
    readRGBDistance(),
    readGateDistance(),
    (bool)digitalRead(PIN_LDR_LED),
    (bool)digitalRead(PIN_PUMP),
    (_gatePos == 90)
  };
}
