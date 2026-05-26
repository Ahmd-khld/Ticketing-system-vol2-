#include <Servo.h>
#include <DHT.h>
#include <SoftwareSerial.h>

// ===================== PIN DEFINITIONS =====================
#define MOISTURE_SENSOR_PIN A0
#define PUMP_PIN 7
#define DRY_THRESHOLD 500
#define HUMIDITY_THRESHOLD 60
#define TEMP_THRESHOLD 30

const int trigPin = 9;
const int echoPin = 10;

const int redPin   = 11;
const int greenPin = 6;
const int bluePin  = 5;
const bool COMMON_ANODE = false;

const int LDR_DO_PIN  = 8;
const int LDR_LED_PIN = 12;

const int TRIG_PIN = 2;
const int ECHO_PIN = 3;
const int SERVO_PIN = 4;
const int DETECTION_THRESHOLD = 7;

const int DHTPIN = 13;
const int DHTTYPE = DHT11;
DHT dht(DHTPIN, DHTTYPE);

// ===================== ESP-01S WIFI SETUP =====================
// Using A1 (RX from ESP TX) and A2 (TX to ESP RX) — both free pins.
// Wire: Arduino A1 → ESP TX | Arduino A2 → ESP RX (via 3.3 V voltage divider)
SoftwareSerial espSerial(A4, A5); // RX, TX

const char* WIFI_SSID     = "test";       // <-- Replace with your WiFi SSID
const char* WIFI_PASSWORD = "12345678";   // <-- Replace with your WiFi password
const char* SERVER_HOST   = "192.168.137.1";   // <-- Replace with the PC IP running your backend
const int   SERVER_PORT   = 5000;
const char* SERVER_PATH   = "/api/hardware/telemetry";           // POST endpoint on your backend

// ===================== STATE VARIABLES =====================
Servo myServo;
bool servoActive = false;
unsigned long servoActiveTime = 0;
const unsigned long HOLD_DURATION = 2000;

long duration = 0;
int distance = -1;
int lastBand = -1;

unsigned long lastUpdate = 0;
const unsigned long UPDATE_INTERVAL = 2000;

// ===================== HELPERS =====================
inline void pwmWrite(int pin, uint8_t v) {
  analogWrite(pin, COMMON_ANODE ? (255 - v) : v);
}

void setColor(uint8_t r, uint8_t g, uint8_t b) {
  pwmWrite(redPin, r);
  pwmWrite(greenPin, g);
  pwmWrite(bluePin, b);
}

int measureDistanceRawOnceRGB() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long t = pulseIn(echoPin, HIGH, 30000UL);
  if (t == 0) return -1;
  return (int)(t * 0.034 / 2.0);
}

int median3(int a, int b, int c) {
  if (a > b) { int t=a; a=b; b=t; }
  if (b > c) { int t=b; b=c; c=t; }
  if (a > b) { int t=a; a=b; b=t; }
  return b;
}

int measureDistanceCmRGB() {
  int d1 = measureDistanceRawOnceRGB();
  int d2 = measureDistanceRawOnceRGB();
  int d3 = measureDistanceRawOnceRGB();
  if (d1 < 0 && d2 < 0 && d3 < 0) return -1;
  if (d1 < 0) d1 = d2;
  if (d3 < 0) d3 = d2;
  return median3(d1, d2, d3);
}

int bandFromDistance(int d) {
  if (d < 0) return -1;
  if (d <= 5)  return 0;
  if (d <= 10) return 1;
  if (d <= 15) return 2;
  return 2;
}

void applyBandIfChanged(int band) {
  if (band == lastBand) return;
  switch(band) {
    case 0: setColor(255, 0, 0); Serial.println(F("LED: RED")); break;
    case 1: setColor(255, 255, 0); Serial.println(F("LED: YELLOW")); break;
    case 2: setColor(0, 255, 0); Serial.println(F("LED: GREEN")); break;
    default: return;
  }
  lastBand = band;
}

int readMoistureRawOnce() {
  analogRead(MOISTURE_SENSOR_PIN);
  delayMicroseconds(150);
  return analogRead(MOISTURE_SENSOR_PIN);
}

int medianOf5Moisture() {
  int v[5];
  for (int i=0; i<5; i++) v[i]=readMoistureRawOnce();
  for (int i=1;i<5;i++){
    int key=v[i], j=i-1;
    while (j>=0 && v[j] > key) { v[j+1]=v[j]; j--; }
    v[j+1]=key;
  }
  return v[2];
}

bool moistureValid(int raw) {
  return (raw > 0 && raw < 1023);
}

float measureDistanceServo() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long t = pulseIn(ECHO_PIN, HIGH);
  return (t * 0.034) / 2;
}

// ===================== ESP-01S AT HELPERS =====================

// Send an AT command and wait up to `timeoutMs` for `expected` in the response.
// Returns true if the expected string was found.
bool espSendAT(const char* cmd, const char* expected, unsigned long timeoutMs = 3000) {
  espSerial.println(cmd);
  unsigned long start = millis();
  String resp = "";
  while (millis() - start < timeoutMs) {
    while (espSerial.available()) {
      resp += (char)espSerial.read();
    }
    if (resp.indexOf(expected) != -1) return true;
  }
  Serial.print(F("AT fail: ")); Serial.print(cmd);
  Serial.print(F(" => ")); Serial.println(resp);
  return false;
}

// Connect the ESP-01S to WiFi. Called once in setup().
void espConnect() {
  espSerial.begin(9600); // Match your ESP-01S baud rate (factory default 115200;
                         // reflash or use AT+UART_DEF=9600 first if needed)
  delay(1000);

  espSendAT("AT",            "OK",   2000);
  espSendAT("AT+CWMODE=1",   "OK",   2000); // Station mode

  // Build join command: AT+CWJAP="SSID","PASS"
  char joinCmd[80];
  snprintf(joinCmd, sizeof(joinCmd), "AT+CWJAP=\"%s\",\"%s\"", WIFI_SSID, WIFI_PASSWORD);
  if (espSendAT(joinCmd, "WIFI GOT IP", 15000)) {
    Serial.println(F("ESP: WiFi connected"));
  } else {
    Serial.println(F("ESP: WiFi connection failed — check SSID/password"));
  }
}

// Send a single HTTP POST to the backend with the sensor readings as JSON.
void sendToBackend(int moisture, float humidity, float tempC,
                   int rgbDist,  float servoDist, bool pumpOn,
                   bool ldrOn,   bool servoOpen) {
  
  // Sanitize NaN values to 0.0 to prevent invalid JSON
  if (isnan(humidity)) humidity = 0.0;
  if (isnan(tempC)) tempC = 0.0;
  if (isnan(servoDist)) servoDist = 0.0;

  // Convert floats to strings because snprintf doesn't support %f on many Arduinos
  char strHum[10];
  char strTemp[10];
  char strDist[10];
  
  dtostrf(humidity, 1, 1, strHum);
  dtostrf(tempC, 1, 1, strTemp);
  dtostrf(servoDist, 1, 1, strDist);

  // Build JSON payload
  char payload[250];
  snprintf(payload, sizeof(payload),
    "{\"moisture\":%d,\"humidity\":%s,\"temperature\":%s,"
    "\"rgbDistance\":%d,\"servoDistance\":%s,"
    "\"pumpStatus\":\"%s\",\"ldrStatus\":\"%s\",\"servoStatus\":\"%s\"}",
    moisture, strHum, strTemp,
    rgbDist, strDist,
    pumpOn ? "ON" : "OFF",
    ldrOn  ? "ON" : "OFF",
    servoOpen ? "OPEN" : "CLOSED"
  );
  int payloadLen = strlen(payload);

  Serial.print(F("Sending Payload: "));
  Serial.println(payload);

  // Open TCP connection
  char connCmd[60];
  snprintf(connCmd, sizeof(connCmd),
    "AT+CIPSTART=\"TCP\",\"%s\",%d", SERVER_HOST, SERVER_PORT);
  if (!espSendAT(connCmd, "CONNECT", 5000)) {
    Serial.println(F("ESP: TCP connect failed"));
    return;
  }

  // Build HTTP request
  char httpReq[400];
  int httpLen = snprintf(httpReq, sizeof(httpReq),
    "POST %s HTTP/1.1\r\n"
    "Host: %s:%d\r\n"
    "Content-Type: text/plain\r\n"
    "Content-Length: %d\r\n"
    "Connection: close\r\n"
    "\r\n"
    "%s",
    SERVER_PATH, SERVER_HOST, SERVER_PORT, payloadLen, payload
  );

  // Tell ESP how many bytes to send
  char sendCmd[20];
  snprintf(sendCmd, sizeof(sendCmd), "AT+CIPSEND=%d", httpLen);
  if (!espSendAT(sendCmd, ">", 3000)) {
    Serial.println(F("ESP: CIPSEND prompt failed"));
    espSendAT("AT+CIPCLOSE", "OK", 2000);
    return;
  }

  espSerial.print(httpReq);

  // Wait for SEND OK or server response
  unsigned long start = millis();
  String resp = "";
  while (millis() - start < 5000) {
    while (espSerial.available()) resp += (char)espSerial.read();
    if (resp.indexOf("SEND OK") != -1 || resp.indexOf("CLOSED") != -1) break;
  }

  espSendAT("AT+CIPCLOSE", "OK", 2000);
  Serial.println(F("ESP: Data sent"));
}

// ===================== SETUP =====================
void setup() {
  Serial.begin(9600);

  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);

  pinMode(redPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  pinMode(bluePin, OUTPUT);
  setColor(0,0,0);

  pinMode(PUMP_PIN, OUTPUT);
  digitalWrite(PUMP_PIN, LOW);

  pinMode(LDR_DO_PIN, INPUT);
  pinMode(LDR_LED_PIN, OUTPUT);
  digitalWrite(LDR_LED_PIN, LOW);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  myServo.attach(SERVO_PIN);
  myServo.write(0);

  dht.begin();

  Serial.println(F("System Initialized: RGB + Moisture + LDR + Servo + DHT11"));

  // Connect ESP-01S to WiFi
  espConnect();
}

// ===================== LOOP =====================
void loop() {
  if (millis() - lastUpdate >= UPDATE_INTERVAL) {
    lastUpdate = millis();

    // --- LDR ---
    bool ldrState = digitalRead(LDR_DO_PIN);
    digitalWrite(LDR_LED_PIN, ldrState);

    // --- RGB Ultrasonic ---
    distance = measureDistanceCmRGB();
    Serial.print(F("RGB Distance: "));
    if (distance < 0) Serial.println(F("No echo"));
    else Serial.println(distance);

    int band = bandFromDistance(distance);
    applyBandIfChanged(band);

    // Resolve current LED color label for transmission
    const char* ledColor = "GREEN";
    if (band == 0)      ledColor = "RED";
    else if (band == 1) ledColor = "YELLOW";

    // --- Soil Moisture + Humidity/Temperature ---
    int moistureValue = medianOf5Moisture();
    Serial.print(F("Moisture: "));
    Serial.println(moistureValue);

    float humidity = dht.readHumidity();
    float temperatureC = dht.readTemperature();

    Serial.print(F("Humidity: "));
    Serial.print(humidity);
    Serial.print(F("%  Temp: "));
    Serial.print(temperatureC);
    Serial.println(F("°C"));

    bool pumpOn = false;
    if (moistureValid(moistureValue)) {
      if (moistureValue > DRY_THRESHOLD || (humidity < HUMIDITY_THRESHOLD && temperatureC > TEMP_THRESHOLD)) {
        digitalWrite(PUMP_PIN, HIGH);
        pumpOn = true;
        Serial.println(F("Pump ON (Dry soil OR Low humidity & High temp)"));
      } else {
        digitalWrite(PUMP_PIN, LOW);
        Serial.println(F("Pump OFF"));
      }
    } else {
      Serial.println(F("Moisture reading out of range, skipping pump logic"));
      digitalWrite(PUMP_PIN, LOW);
    }

    // --- Servo Ultrasonic ---
    float distance_cm = measureDistanceServo();
    if (distance_cm > 0 && distance_cm < DETECTION_THRESHOLD) {
      if (!servoActive) {
        myServo.write(90);
        servoActive = true;
        Serial.print(F("Motion detected at "));
        Serial.println(distance_cm);
      }
      servoActiveTime = millis();
    }
    if (servoActive && millis() - servoActiveTime >= HOLD_DURATION) {
      myServo.write(0);
      servoActive = false;
      Serial.println(F("Servo returned to 0°"));
    }

    Serial.println(F("------------------------"));

    // --- Send all readings to backend via ESP-01S ---
    sendToBackend(
      moistureValue, humidity, temperatureC,
      distance,      distance_cm,
      pumpOn,        ldrState,
      servoActive
    );
  }
}

