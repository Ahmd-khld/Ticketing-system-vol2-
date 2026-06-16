/**
 * Smart Park IoT Node — ESP32 / ESP-IDF port
 * ------------------------------------------------------------------
 * This is a native ESP-IDF (C++) port of the Arduino sketch under
 * arduino/. It preserves the original architecture:
 *
 *   - TelemetryPacket      : the data record sent to the backend
 *   - PeripheralInterface  : sensor reads + local automation
 *   - RuntimeDispatcher    : the main loop / telemetry cadence
 *
 * IMPORTANT — running under QEMU:
 *   `idf.py qemu` emulates the ESP32 CPU, RAM, flash and UART only.
 *   It does NOT emulate GPIO/ADC peripherals or the WiFi radio. So the
 *   sensor reads below are SIMULATED and telemetry is printed to the
 *   serial console instead of POSTed over WiFi. Every stub is marked
 *   with `// [HW]` to show exactly what to replace when you flash a
 *   real ESP32 (driver/gpio.h, esp_adc, esp_wifi, esp_http_client).
 */

#include <cstdio>
#include <cmath>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"

static const char *TAG = "SmartPark";

// ===================== SYSTEM PARAMETERS =====================
namespace cfg {
    constexpr int  DRY_THRESHOLD            = 500;
    constexpr int  HUMIDITY_THRESHOLD       = 60;
    constexpr int  TEMP_THRESHOLD           = 30;
    constexpr int  GATE_DETECTION_THRESHOLD = 7;     // cm
    constexpr uint32_t GATE_HOLD_DURATION   = 2000;  // ms
    constexpr uint32_t TELEMETRY_INTERVAL   = 2000;  // ms
}

// ===================== TELEMETRY PACKET =====================
struct TelemetryPacket {
    int   moisture;
    float humidity;
    float temperature;
    int   rgbDistance;
    float gateDistance;
    bool  ldrStatus;
    bool  pumpStatus;
    bool  gateStatus;
};

// Monotonic millisecond clock (mirrors Arduino millis()).
static inline uint32_t millis() {
    return (uint32_t)(esp_timer_get_time() / 1000ULL);
}

// ===================== PERIPHERAL INTERFACE =====================
class PeripheralInterface {
public:
    // Manual overrides (set by remote commands).
    bool manualGateOverride = false;
    bool manualLampOverride = false;
    bool manualPumpOverride = false;
    bool manualRGBOverride  = false;

    void begin() {
        // [HW] Configure gpio_set_direction(), adc_oneshot, ledc (RGB PWM),
        //      and attach the servo here. No-op under QEMU.
        ESP_LOGI(TAG, "Peripherals initialized (simulated under QEMU)");
    }

    // ---- Actuators -------------------------------------------------
    void setGate(bool open) { _gatePos = open ? 90 : 0; /* [HW] servo write */ }
    void setPump(bool on)   { _pumpOn = on;             /* [HW] gpio_set_level(PUMP) */ }
    void setLamp(bool on)   { _lampOn = on;             /* [HW] gpio_set_level(LAMP) */ }
    void setRGB(uint8_t r, uint8_t g, uint8_t b) {
        _r = r; _g = g; _b = b;                          // [HW] ledc duty on 3 channels
    }

    // ---- Sensors (SIMULATED for QEMU) ------------------------------
    // [HW] Replace each body with a real read (adc_oneshot_read / pulse echo).
    int   readMoisture()     { return sim(300, 700); }       // raw ADC counts
    float readHumidity()     { return (float)sim(40, 80); }  // %RH
    float readTemperature()  { return (float)sim(20, 35); }  // °C
    int   readRGBDistance()  { return sim(2, 18); }          // cm
    float readGateDistance() { return (float)sim(3, 30); }   // cm
    bool  readLDR()          { return (sim(0, 1) != 0); }    // dark = true

    // ---- Local automation ------------------------------------------
    void runAutomation() {
        if (!manualLampOverride) {
            setLamp(readLDR());
        }

        if (!manualRGBOverride) {
            int d = readRGBDistance();
            int band = (d < 0) ? -1 : (d <= 5 ? 0 : (d <= 10 ? 1 : 2));
            if (band != _lastRGBBand) {
                if      (band == 0) setRGB(255, 0, 0);
                else if (band == 1) setRGB(255, 255, 0);
                else if (band == 2) setRGB(0, 255, 0);
                _lastRGBBand = band;
            }
        }

        if (!manualPumpOverride) {
            int   m = readMoisture();
            float h = readHumidity();
            float t = readTemperature();
            if (m > 0 && m < 1023) {
                bool needWater = (m > cfg::DRY_THRESHOLD) ||
                                 (h < cfg::HUMIDITY_THRESHOLD && t > cfg::TEMP_THRESHOLD);
                setPump(needWater);
            }
        }

        if (!manualGateOverride) {
            float dist = readGateDistance();
            if (dist > 0 && dist < cfg::GATE_DETECTION_THRESHOLD) {
                if (!_gateActive) {
                    setGate(true);
                    _gateActive = true;
                }
                _gateActiveTime = millis();
            }
            if (_gateActive && millis() - _gateActiveTime >= cfg::GATE_HOLD_DURATION) {
                setGate(false);
                _gateActive = false;
            }
        }
    }

    TelemetryPacket captureTelemetry() {
        return TelemetryPacket{
            readMoisture(),
            readHumidity(),
            readTemperature(),
            readRGBDistance(),
            readGateDistance(),
            _lampOn,
            _pumpOn,
            (_gatePos == 90)
        };
    }

private:
    // Simple deterministic-ish simulator so QEMU output varies over time.
    int sim(int lo, int hi) {
        _seed = _seed * 1103515245u + 12345u;
        int span = (hi - lo) + 1;
        return lo + (int)((_seed >> 16) % (uint32_t)span);
    }

    uint32_t _seed = 0xC0FFEEu;
    bool _gateActive = false;
    uint32_t _gateActiveTime = 0;
    int  _gatePos = 0;
    int  _lastRGBBand = -1;
    bool _pumpOn = false;
    bool _lampOn = false;
    uint8_t _r = 0, _g = 0, _b = 0;
};

// ===================== RUNTIME DISPATCHER =====================
class RuntimeDispatcher {
public:
    explicit RuntimeDispatcher(PeripheralInterface &p) : _peripherals(p) {}

    void setup() {
        ESP_LOGI(TAG, "Initializing system...");
        _peripherals.begin();
        // [HW] esp_wifi init + connect would happen here.
        ESP_LOGW(TAG, "WiFi disabled under QEMU; telemetry goes to serial only.");
    }

    void loop() {
        // [HW] poll esp_http_client / socket for remote commands here.
        _peripherals.runAutomation();

        if (millis() - _lastTelemetry >= cfg::TELEMETRY_INTERVAL) {
            _lastTelemetry = millis();
            dispatchTelemetry();
        }
    }

private:
    void dispatchTelemetry() {
        TelemetryPacket d = _peripherals.captureTelemetry();

        // Build the same JSON shape the backend expects.
        char json[256];
        snprintf(json, sizeof(json),
            "{\"moisture\":%d,\"humidity\":%.1f,\"temperature\":%.1f,"
            "\"rgbDistance\":%d,\"servoDistance\":%.1f,"
            "\"ldrStatus\":\"%s\",\"pumpStatus\":\"%s\",\"servoStatus\":\"%s\"}",
            d.moisture, d.humidity, d.temperature,
            d.rgbDistance, d.gateDistance,
            d.ldrStatus ? "ON" : "OFF",
            d.pumpStatus ? "ON" : "OFF",
            d.gateStatus ? "OPEN" : "CLOSED");

        // [HW] _socket.post(SERVER_IP, port, "/api/hardware/telemetry", json);
        ESP_LOGI(TAG, "Telemetry -> %s", json);
    }

    PeripheralInterface &_peripherals;
    uint32_t _lastTelemetry = 0;
};

// ===================== ENTRY POINT =====================
extern "C" void app_main(void) {
    static PeripheralInterface peripherals;
    static RuntimeDispatcher    runtime(peripherals);

    runtime.setup();

    // Arduino-style cooperative loop on the main task.
    while (true) {
        runtime.loop();
        vTaskDelay(pdMS_TO_TICKS(50));  // yield to FreeRTOS
    }
}
