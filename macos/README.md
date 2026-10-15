# Aircon for macOS

A menu bar app for the e-zone aircon, in the style of a macOS 27 app (Liquid Glass controls, SF Symbol animations).
There's no desktop widget.

- **Menu bar**: the running mode's symbol, the setpoint while heating or cooling, and a moon while the sleep timer
  runs (e.g. "❄ 20° ☾"). A dim aircon outline means off; "!" means it can't reach Homebridge.
- **Popover**: power, Cool / Heat / Fan / Dry, the setpoint, fan speed, the sleep timer and every zone. Click a zone to
  open or close it, and hover an open zone for arrows that change its damper in 5 % steps.

It talks to the homebridge-ezone plugin, not the tablet, so the tablet keeps a single poller and the app always agrees
with Apple Home.

## Setup

1. In Homebridge, open the e-zone plugin's settings and turn on **Mac app** (port 8583). Restart the child bridge.
2. Build and install: `./build.sh` (needs Xcode 27, `brew install xcodegen` and an Apple Development certificate).
3. The app expects Homebridge at `http://192.168.0.239:8583`; change it in Settings (the gear in the popover).

## Development

```bash
./build.sh test
./build.sh --no-open
open -n build/DerivedData/Build/Products/Release/Aircon.app --args -setAddress http://127.0.0.1:8583 -previewWindow YES
```

`./build.sh test` runs the tests. `./build.sh --no-open` builds and installs without opening the app. The last command
runs a build against `npm run dev:mock` and also shows the popover in a normal window for screenshots. `-setAddress`
saves the address, so launch once with `-setAddress ""` to go back to the default.
