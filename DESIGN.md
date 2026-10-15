# homebridge-ezone: Apple Home design

A rewrite of homebridge-myplace for an Advantage Air **e-zone** tablet only: one aircon, damper zones, no lights,
things, garage doors, blinds or MyAir/MyAuto features. Agreed with Brendan on 2026-10-15.

## What Apple Home shows

Two kinds of tile, plus one convenience tile. That is 10 tiles for Brendan's 8 zones, replacing the 15 that
homebridge-myplace created.

### 1. Air Conditioner (one tile)

One accessory (category: air conditioner) with three linked services, shown by Home as a single tile:

| Service | Home control | e-zone call |
|---|---|---|
| **Heater Cooler** (primary) | Tap the tile: on/off. Detail: Heat / Cool picker, setpoint dial, fan-speed slider | `state:on, mode:heat\|cool`, `setTemp`, `fan` |
| **Fan** "Fan Only" | Toggle in the detail view, with Auto and speed | `state:on, mode:vent` |
| **Switch** "Dry" | Toggle in the detail view | `state:on, mode:dry` |

- The three are **one power control with three ways to run**. At most one shows as on: Heater Cooler when the unit
  runs heat or cool, Fan Only when it vents, Dry when it dries. Turning any of them off turns the unit off.
- Tapping the tile while the unit is off starts it in the last heat/cool mode it ran (the e-zone remembers).
  If Home sends "on" to several services at once (a grouped-tile tap), Heater Cooler wins.
- **Fan speed** on the Heater Cooler is a 4-stop slider: 25 % Low, 50 % Medium, 75 % High, 100 % Auto.
  The Fan Only service has Home's own Auto toggle plus the same three speeds.
- **Setpoint** 16–32 °C in 1 ° steps (one value for heat and cool, as on the tablet).
- **Current temperature**: e-zone without zone sensors has no room reading, so the dial's "current" value is the
  setpoint. A zone sensor or the constant zone's sensor is used instead if one exists.
- **Fault**: a non-empty `airconErrorCode` sets the tile's fault badge.

### 2. One tile per zone

One accessory per zone (category: fan), named from the tablet, e.g. "Master Bed Zone". Brendan moves each into its
real room in Home.

- **Tap**: open/close the zone. Independent of the aircon: it never starts or stops the unit.
- **Long-press**: damper opening, 5–100 % in 5 % steps. Dragging to 0 closes the zone.
- The **constant zone** can't be closed on the e-zone; if Home closes it, the tile springs back open.
- A zone with a temperature sensor also gets a temperature reading in the same tile.

### 3. Sleep Timer (one tile)

A switch accessory, its own tile so it is one tap from the Home view, Control Center or the Lock Screen.

- **Tap on** (aircon running): the e-zone's own off-countdown is set to **2 hours** (`countDownToOff:120`), so the
  tablet shows it too. The tile stays on until the countdown ends or is cancelled.
- **Tap off**: cancels the countdown.
- **Tap on while the aircon is off**: nothing to time, so the tile springs back off.
- The duration is a plugin setting (default 120 min).

Other timers belong in Home automations, e.g. "At 11 pm turn off Air Conditioner".

## Apple Home features used

- **Rooms**: zone tiles live in their rooms, so each room shows its own airflow control and Siri understands
  "turn on the Rumpus Zone".
- **Control Center, Lock Screen and Apple Watch** (iOS 18+): Air Conditioner and Sleep Timer are good candidates.
- **Siri**: "set the air conditioner to 22", "turn on the sleep timer".
- **Automations and scenes**: all tiles are plain HomeKit services, so every one is usable as a trigger or action.
- **Not used**: Matter. Apple Home's Matter Room Air Conditioner hides Fan and Dry modes, and Adaptive Temperature
  needs a Matter thermostat with a real room temperature, which this e-zone doesn't have. iOS 27's Home changes
  (camera intelligence, notification grouping, Electricity) don't touch climate accessories.

## To verify on a real Home before building everything

1. The Air Conditioner tile with linked Fan Only and Dry services shows as one tile on iOS 27, with the toggles in
   its detail view. What a tile tap sends to the linked services.
2. A 4-stop fan slider is usable on the Heater Cooler card.
3. Sleep Timer and zone tiles can be added to Control Center.

## e-zone API (local HTTP, port 2025)

- `GET /getSystemData` → `aircons.ac1.info` (state, mode, fan, setTemp, countDownToOff, constant1–3, myZone,
  airconErrorCode, …) and `aircons.ac1.zones.zNN` (name, state open/close, value 5–100, type, rssi, measuredTemp).
- `GET /setAircon?json={ac1:{info:{…}}}` or `{ac1:{zones:{z04:{state:open}}}}` → `{"ack":true}`.
- The tablet copes badly with parallel requests: one request in flight at a time, writes coalesced, then re-read.
