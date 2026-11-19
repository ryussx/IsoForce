# Iso Force

An open-source force readout for isometric and self-resisted training. A Bluetooth
crane scale is the sensor, your Android phone is the screen: live force curve, peak /
intensity / output / inroad per set, protocols, voice callouts, history and a built-in
simulator. Think of the display on a motorized isokinetic machine, for the price of a
luggage scale.

No account, no cloud, no tracking. Everything stays on the phone.

## Features

- **Live force chart** (force vs. time) with the last set of the same exercise ghosted behind it
- **Set metrics**: peak, intensity (average), output (kg·s), goal (your best output), inroad (% strength drop over the set)
- **Protocols**: free set, countdown, ramp + hold, repeaters, max test (best of 3), critical-force test (7 s / 3 s × 24)
- **Rep detection** from force peaks, per-rep peak bars, tempo; manual rep count and editable date per set
- **Target zone**: % of your max — banner goes green/red, voice says "more" / "ease off"
- **Left/right asymmetry** from per-side maxes
- **Voice callouts and beeps**: phase cues, optional per-second beep and spoken count, force readout every N seconds
- **Camera preview** floating over the app so a screen recording captures you and the numbers together
- **History** with per-exercise progress chart, set detail, "use as ghost"
- **Export** CSV / JSON (share sheet on Android, download in the browser)
- **Simulator** so everything can be tried without a scale

## Supported scales

Any scale that broadcasts in the WeiHeng **WH-C06 / WH-C100** Bluetooth format. These are sold
under many names ("Bluetooth crane scale", "smart luggage scale 300 kg"); the Bluetooth name
starts with `IF_`. They are pure BLE broadcasters — **do not pair them in Android settings**
(it will sit on "Pairing…" forever). Just turn the scale on and tap **Connect scale** in the app.

Weight lives in the advertisement's manufacturer data under company ID `0x0100`:
bytes 10–11 = kg × 100, big-endian, ~10 packets/s. See `src/scale.ts`. Settings → **Scan
debug** lists every advertisement the phone hears, which makes supporting another scale a
small change to the decoder.

### Converting a non-Bluetooth crane scale

`firmware/` has an ESP32 + HX711 sketch that reads the scale's own load cell and broadcasts
in the same format, plus wiring diagrams. Calibrate once over USB in the Arduino IDE Serial
Monitor (`t` to tare, `c <kg>` with a known weight); the factor is saved to flash.

## Rigging

The scale measures tension only. Anchor one end to something immovable, the other to a strap,
bar or handle. For pressing patterns, put the scale inside a strap loop that goes under tension
when you push (strap behind the back for chest press; stand on a strap for overhead press or
squat). For self-resisted limb-vs-limb work, put a handle on each end of the scale.

Use rated carabiners or soft shackles on the hooks; don't shock-load it.

## Get the app

Every push to `main` builds an APK: repo → **Actions** → latest run → **Artifacts** →
**IsoForce-apk**. Install it on Android (allow installs from your browser/files app). Grant
**Nearby devices** when asked; on Xiaomi/HyperOS also turn **Location** on, or BLE scans
return nothing.

Builds are signed with the committed `android/app/ci.keystore`, so each one installs over
the previous. If you fork this, generate your own key and either commit it or supply it as
repository secrets (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`),
which take precedence.

## Run in the browser (simulator only)

```bash
npm install
npm run dev
```

Bluetooth scanning needs the native Android build; in the browser use **Simulator**.
Voice uses the Web Speech API in the browser and the phone's own TTS engine in the APK.

## Build locally

```bash
npm install
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # -> android/app/build/outputs/apk/debug/app-debug.apk
```

## Layout

```
src/scale.ts      force sources: BleScale (real), SimScale (test); WeiHeng decoder
src/metrics.ts    set recorder, peak/avg/output/inroad, rep detection, critical force
src/protocols.ts  protocol definitions + phase runner
src/chart.ts      canvas force chart
src/audio.ts      beeps + speech
src/camera.ts     floating camera preview
src/store.ts      persistence (Capacitor Preferences / localStorage)
src/export.ts     CSV/JSON export + share sheet
src/main.ts       UI controller
firmware/         ESP32 + HX711 scale conversion (Arduino sketch, wiring diagrams)
```

## License

MIT — see `LICENSE`.
