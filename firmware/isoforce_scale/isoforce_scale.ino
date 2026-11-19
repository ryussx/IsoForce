/*
  Iso Force Scale — ESP32 + HX711 crane-scale conversion
  ------------------------------------------------------
  Reads the scale's load cell through an HX711 and broadcasts the weight as BLE
  advertisements in the WeiHeng WH-C06 format, so Iso Force's "Connect scale"
  picks it up with no pairing (company ID 0x0100, weight*100 big-endian at bytes 10-11).

  Wiring (see wiring card):
    HX711 VCC -> ESP32 3V3     HX711 DT  -> ESP32 GPIO 16
    HX711 GND -> ESP32 GND     HX711 SCK -> ESP32 GPIO 4
    Load cell: E+ -> E+, E- -> E-, S+/A+ -> A+, S-/A- -> A-
    Battery +  -> slide switch -> ESP32 VIN,  Battery - -> ESP32 GND

  Serial Monitor (115200 baud) commands for calibration:
    t          tare (zero) with nothing on the hook
    c 16       calibrate: a known 16 kg is hanging right now (use your weight's kg)
    r          show raw ADC reading
    f 1234.5   set the calibration factor directly
    s          save calibration to flash (c does this automatically)

  Arduino IDE setup:
    Boards Manager  -> "esp32" by Espressif
    Library Manager -> "HX711" by Bogdan Necula (bogde)
    Board: "ESP32 Dev Module"   Upload speed: 921600   Partition: default
*/

#include <Arduino.h>
#include <HX711.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEAdvertising.h>

// ---------------- pins ----------------
const int PIN_DT  = 16;
const int PIN_SCK = 4;
const int PIN_LED = 2;      // onboard blue LED on most ESP32 dev boards

// ---------------- config ----------------
const char*    BLE_NAME        = "IF_ISOFORCE";
const uint16_t COMPANY_ID      = 0x0100;   // WeiHeng
const uint32_t ADV_PERIOD_MS   = 100;      // ~10 Hz like the real WH-C06
const float    DEFAULT_FACTOR  = 22000.0f; // placeholder until you calibrate

HX711       scale;
Preferences prefs;
BLEAdvertising* adv = nullptr;

float   calFactor = DEFAULT_FACTOR;
long    tareOffset = 0;
float   kgSmoothed = 0;
uint32_t lastAdv = 0;
uint32_t lastBlink = 0;

// ---------------- helpers ----------------
void loadCal() {
  prefs.begin("ufs", true);
  calFactor  = prefs.getFloat("factor", DEFAULT_FACTOR);
  tareOffset = prefs.getLong("tare", 0);
  prefs.end();
}
void saveCal() {
  prefs.begin("ufs", false);
  prefs.putFloat("factor", calFactor);
  prefs.putLong("tare", tareOffset);
  prefs.end();
  Serial.printf("saved: factor=%.3f tare=%ld\n", calFactor, tareOffset);
}

// Build the WeiHeng-style manufacturer payload (after the 2-byte company id):
// bytes 0..9 filler, 10..11 = weight*100 big-endian, 12 = 0, 13 = stable flag + unit (kg)
void setAdvertisedWeight(float kg) {
  if (kg < 0) kg = 0;
  uint16_t w = (uint16_t)min(65535.0f, kg * 100.0f);
  uint8_t payload[2 + 14];
  payload[0] = COMPANY_ID & 0xFF;          // company id little-endian: 0x00, 0x01
  payload[1] = (COMPANY_ID >> 8) & 0xFF;
  for (int i = 2; i < 12; i++) payload[i] = 0;
  payload[2 + 10] = (w >> 8) & 0xFF;
  payload[2 + 11] = w & 0xFF;
  payload[2 + 12] = 0;
  payload[2 + 13] = 0x10;                  // high nibble 1 = stable, low nibble 0 = kg

  BLEAdvertisementData d;
  d.setFlags(0x06);
  d.setManufacturerData(String((const char*)payload, sizeof(payload)));
  BLEAdvertisementData sr;
  sr.setName(BLE_NAME);

  adv->stop();
  adv->setAdvertisementData(d);
  adv->setScanResponseData(sr);
  adv->start();
}

float readKg() {
  if (!scale.is_ready()) return kgSmoothed;
  long raw = scale.read();                 // one 10 SPS sample
  float kg = (raw - tareOffset) / calFactor;
  // light smoothing: fast enough for isometrics, kills single-sample noise
  kgSmoothed = kgSmoothed * 0.5f + kg * 0.5f;
  return kgSmoothed;
}

void handleSerial() {
  static String line;
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\n' || ch == '\r') {
      line.trim();
      if (line.length()) {
        char cmd = line[0];
        float arg = line.length() > 1 ? line.substring(1).toFloat() : 0;
        if (cmd == 't') {
          tareOffset = scale.read_average(20);
          Serial.printf("tare offset = %ld\n", tareOffset);
          saveCal();
        } else if (cmd == 'c' && arg > 0) {
          long avg = scale.read_average(20);
          calFactor = (avg - tareOffset) / arg;
          Serial.printf("calibrated with %.2f kg: factor = %.3f\n", arg, calFactor);
          saveCal();
        } else if (cmd == 'r') {
          Serial.printf("raw = %ld  (tare %ld, factor %.3f) -> %.2f kg\n",
                        scale.read_average(5), tareOffset, calFactor, kgSmoothed);
        } else if (cmd == 'f' && arg != 0) {
          calFactor = arg; saveCal();
        } else if (cmd == 's') {
          saveCal();
        } else {
          Serial.println("commands: t | c <kg> | r | f <factor> | s");
        }
      }
      line = "";
    } else {
      line += ch;
    }
  }
}

// ---------------- setup / loop ----------------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  delay(300);
  Serial.println("\nIso Force Scale starting");

  scale.begin(PIN_DT, PIN_SCK);
  loadCal();
  Serial.printf("factor=%.3f tare=%ld\n", calFactor, tareOffset);
  if (tareOffset == 0 && scale.wait_ready_timeout(2000)) {
    tareOffset = scale.read_average(10);   // first boot: zero wherever it is
    Serial.printf("initial tare = %ld (type 't' with an empty hook, then 'c <kg>' with a known weight)\n", tareOffset);
  }

  BLEDevice::init(BLE_NAME);
  adv = BLEDevice::getAdvertising();
  adv->setMinInterval(0x50);               // 50 ms
  adv->setMaxInterval(0xA0);               // 100 ms
  setAdvertisedWeight(0);
  Serial.println("advertising as WeiHeng-compatible scale");
}

void loop() {
  handleSerial();
  float kg = readKg();

  uint32_t now = millis();
  if (now - lastAdv >= ADV_PERIOD_MS) {
    lastAdv = now;
    setAdvertisedWeight(kg);
    static uint8_t n = 0;
    if ((++n % 10) == 0) Serial.printf("%.2f kg\n", kg);
  }
  // heartbeat: slow blink idle, fast blink under load
  uint32_t blinkMs = kg > 2 ? 150 : 1000;
  if (now - lastBlink >= blinkMs) { lastBlink = now; digitalWrite(PIN_LED, !digitalRead(PIN_LED)); }
}
