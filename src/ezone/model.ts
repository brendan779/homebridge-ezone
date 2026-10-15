/**
 * The parts of the e-zone tablet's `getSystemData` reply this plugin uses, and the plugin's own view of them.
 * Everything here is pure so it can be tested without a tablet.
 */

export type UnitMode = 'cool' | 'heat' | 'vent' | 'dry';
export type ClimateMode = 'cool' | 'heat';
export type FanSpeed = 'low' | 'medium' | 'high' | 'auto';
/** How the unit is running, as Apple Home sees it: one of the three services on the Air Conditioner tile, or off. */
export type Run = 'climate' | 'vent' | 'dry' | 'off';

export interface RawZone {
  name?: string;
  number?: number;
  state?: string;
  value?: number;
  type?: number;
  rssi?: number;
  measuredTemp?: number;
  error?: number;
}

export interface RawAircon {
  info?: Record<string, unknown>;
  zones?: Record<string, RawZone>;
}

export interface RawSystemData {
  aircons?: Record<string, RawAircon>;
}

export interface Zone {
  /** Tablet key, e.g. `z04`. */
  id: string;
  number: number;
  name: string;
  open: boolean;
  /** Damper opening, 5–100 %. */
  damper: number;
  /** Measured temperature, or null for zones without a sensor. */
  temperature: number | null;
  /** The e-zone keeps constant zones open to protect airflow. */
  constant: boolean;
}

export interface Aircon {
  uid: string;
  name: string;
  power: boolean;
  /** Last mode the unit reported; an off unit keeps the mode it will start in. */
  mode: UnitMode;
  fan: FanSpeed;
  /** Value the tablet wants for automatic fan: `autoAA` on systems with that feature enabled, else `auto`. */
  autoFanValue: 'auto' | 'autoAA';
  setTemp: number;
  /** Minutes until the unit turns itself off, 0 when no countdown is running. */
  offCountdown: number;
  errorCode: string;
  zones: Zone[];
}

export const MIN_SET_TEMP = 16;
export const MAX_SET_TEMP = 32;

const MODES: readonly UnitMode[] = ['cool', 'heat', 'vent', 'dry'];

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/** "MASTER BED" → "Master Bed". Keeps short all-caps words such as "TV", and names already in mixed case. */
export function titleCase(name: string): string {
  if (name !== name.toUpperCase()) {
    return name.trim().replace(/\s+/g, ' ');
  }
  return name
    .trim()
    .split(/\s+/)
    .map((word) => (word.length <= 2 ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ');
}

export function parseFan(value: string): FanSpeed {
  switch (value) {
    case 'low':
    case 'medium':
    case 'high':
      return value;
    default:
      // `auto` and `autoAA` are both automatic fan.
      return 'auto';
  }
}

/**
 * Reads one aircon from a `getSystemData` reply. Throws when the reply doesn't contain it, which the caller treats
 * like a failed request.
 */
export function parseAircon(data: RawSystemData, key: string): Aircon {
  const raw = data.aircons?.[key];
  if (raw?.info === undefined) {
    throw new Error(`the tablet's reply has no aircon "${key}"`);
  }
  const info = raw.info;
  const constants = new Set([info.constant1, info.constant2, info.constant3].filter((n) => typeof n === 'number' && n > 0));
  const declaredZones = num(info.noOfZones, Number.POSITIVE_INFINITY);

  const zones: Zone[] = Object.entries(raw.zones ?? {})
    .map(([id, zone]) => ({ id, zone, number: num(zone.number, Number.parseInt(id.slice(1), 10)) }))
    .filter(({ number }) => number <= declaredZones)
    .sort((a, b) => a.number - b.number)
    .map(({ id, zone, number }) => {
      const hasSensor = num(zone.type, 0) > 0 && num(zone.rssi, 0) > 0;
      return {
        id,
        number,
        name: titleCase(str(zone.name, `Zone ${number}`)) || `Zone ${number}`,
        open: zone.state === 'open',
        damper: Math.min(100, Math.max(5, num(zone.value, 100))),
        temperature: hasSensor ? num(zone.measuredTemp, 0) : null,
        constant: constants.has(number),
      };
    });

  const mode = str(info.mode, 'cool');
  return {
    uid: str(info.uid, key),
    name: titleCase(str(info.name, 'Aircon')),
    power: info.state === 'on',
    mode: (MODES as readonly string[]).includes(mode) ? (mode as UnitMode) : 'cool',
    fan: parseFan(str(info.fan, 'auto')),
    autoFanValue: info.aaAutoFanModeEnabled === true ? 'autoAA' : 'auto',
    setTemp: num(info.setTemp, 24),
    offCountdown: num(info.countDownToOff, 0),
    errorCode: str(info.airconErrorCode, ''),
    zones,
  };
}

/** Which Air Conditioner service is on. */
export function runOf(aircon: Aircon): Run {
  if (!aircon.power) {
    return 'off';
  }
  switch (aircon.mode) {
    case 'cool':
    case 'heat':
      return 'climate';
    case 'vent':
      return 'vent';
    case 'dry':
      return 'dry';
  }
}

/**
 * The room temperature to show on the Heater Cooler dial: a constant zone's sensor, else any zone sensor (average),
 * else the setpoint, because e-zone systems without sensors have no reading at all.
 */
export function roomTemperature(aircon: Aircon): number {
  const sensed = aircon.zones.filter((zone) => zone.temperature !== null && zone.temperature > 0);
  const constant = sensed.find((zone) => zone.constant);
  if (constant?.temperature != null) {
    return constant.temperature;
  }
  if (sensed.length > 0) {
    const total = sensed.reduce((sum, zone) => sum + (zone.temperature ?? 0), 0);
    return Math.round((total / sensed.length) * 10) / 10;
  }
  return aircon.setTemp;
}

/**
 * Picks one run from requests that arrive together. Tapping a grouped tile can switch every service of the
 * accessory at once, so "on" beats "off", and heat/cool beats fan-only beats dry.
 */
export function resolveRun(requests: readonly Run[]): Run | undefined {
  for (const run of ['climate', 'vent', 'dry', 'off'] as const) {
    if (requests.includes(run)) {
      return run;
    }
  }
  return undefined;
}

/** Fan speed ↔ the 4-stop slider: 25 % low, 50 % medium, 75 % high, 100 % auto. */
export function fanToPercent(fan: FanSpeed): number {
  switch (fan) {
    case 'low':
      return 25;
    case 'medium':
      return 50;
    case 'high':
      return 75;
    case 'auto':
      return 100;
  }
}

export function percentToFan(percent: number): FanSpeed {
  if (percent <= 37) {
    return 'low';
  }
  if (percent <= 62) {
    return 'medium';
  }
  if (percent <= 87) {
    return 'high';
  }
  return 'auto';
}

const FAN_CYCLE: readonly FanSpeed[] = ['low', 'medium', 'high', 'auto'];

/** The speed one tap on the Fan Speed tile moves to: low → medium → high → auto → low. */
export function nextFan(fan: FanSpeed): FanSpeed {
  return FAN_CYCLE[(FAN_CYCLE.indexOf(fan) + 1) % FAN_CYCLE.length]!;
}

/** Rounds a requested damper opening to the tablet's 5 % steps, 5–100. */
export function damperStep(percent: number): number {
  return Math.min(100, Math.max(5, Math.round(percent / 5) * 5));
}

export function clampSetTemp(value: number): number {
  return Math.min(MAX_SET_TEMP, Math.max(MIN_SET_TEMP, Math.round(value)));
}
