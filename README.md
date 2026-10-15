# homebridge-ezone

An Advantage Air **e-zone** ducted aircon in Apple Home, with as few tiles as possible:

- **Air Conditioner**: tap for on/off. Long-press for Heat/Cool and the setpoint. **Fan Only** and **Dry** are
  switches that run the unit in those modes.
- **Fan Speed**: tap to step Low → Medium → High → Auto. Long-press for a slider (25/50/75/100 %, 100 % = Auto).
- **One tile per zone**: tap to open or close it, long-press to set the damper (5 % steps). Zones never start or stop the aircon.
- **Sleep Timer**: one tap turns the aircon off in 2 hours using the tablet's own countdown, so the tablet shows it too.

Move each zone tile into its room in the Home app. For other timers, use Home automations (for example "At 11 pm,
turn off Air Conditioner"). See [DESIGN.md](DESIGN.md) for the reasoning.

Rewritten from [homebridge-myplace](https://github.com/uswong/homebridge-myplace) by Ung Sing Wong (MIT). This version
supports the e-zone only: no lights, things, garage doors, blinds or MyAir features.

## Setup

1. Give the e-zone tablet a fixed IP address in your router.
2. Install the plugin and set **Tablet IP address**. Running it as a child bridge is recommended.
3. Remove any other plugin that talks to the same tablet (for example homebridge-myplace). The tablet copes badly
   with two pollers.

```json
{ "platform": "EZone", "name": "e-zone", "host": "192.168.0.201" }
```

Options: `sleepTimerMinutes` (default 120), `pollSeconds` (default 10), `port` (default 2025), `aircon` (default `ac1`).

## Mac app

`macos/` holds **Aircon**, a menu bar app for the Mac. Turn on **Mac app** in the plugin settings
(`"macApp": { "enabled": true }`, port 8583). The plugin then serves `GET /status` and `POST /control` on your local
network. Anyone on your network can control the aircon through it, just as they can with the tablet. See
[macos/README.md](macos/README.md).

## Development

```bash
npm install
npm run check
npm run mock -- --port 12025 --fast
npm run dev:mock
```

`npm run mock` starts a fake tablet, built from a real e-zone reply with its IDs removed. `npm run dev:mock` runs a
local Homebridge ("e-zone Test", PIN 031-45-277) against it.
