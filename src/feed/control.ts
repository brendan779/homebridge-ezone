import type { EzoneController } from '../ezone/controller.ts';
import { roomTemperature, runOf } from '../ezone/model.ts';
import type { Aircon, FanSpeed, UnitMode } from '../ezone/model.ts';

/** `GET /status` body: everything the Mac app shows. */
export interface FeedStatus {
  online: boolean;
  /** When the tablet was last read successfully (ISO 8601), or null before the first read. */
  updatedAt: string | null;
  sleepTimerMinutes: number;
  aircon: {
    name: string;
    power: boolean;
    mode: UnitMode;
    run: 'climate' | 'vent' | 'dry' | 'off';
    fan: FanSpeed;
    setTemp: number;
    roomTemp: number;
    offCountdown: number;
    errorCode: string;
  } | null;
  zones: { id: string; name: string; open: boolean; damper: number; constant: boolean; temperature: number | null }[];
}

export function feedStatus(aircon: Aircon | null, lastSuccessAt: number, sleepTimerMinutes: number, staleAfterMs: number): FeedStatus {
  return {
    online: aircon !== null && Date.now() - lastSuccessAt <= staleAfterMs,
    updatedAt: lastSuccessAt > 0 ? new Date(lastSuccessAt).toISOString() : null,
    sleepTimerMinutes,
    aircon: aircon === null ? null : {
      name: aircon.name,
      power: aircon.power,
      mode: aircon.mode,
      run: runOf(aircon),
      fan: aircon.fan,
      setTemp: aircon.setTemp,
      roomTemp: roomTemperature(aircon),
      offCountdown: aircon.offCountdown,
      errorCode: aircon.errorCode,
    },
    zones: (aircon?.zones ?? []).map(({ id, name, open, damper, constant, temperature }) => ({ id, name, open, damper, constant, temperature })),
  };
}

/** `POST /control` body. Every field is optional; only what's present changes. */
export interface ControlRequest {
  power?: boolean;
  mode?: UnitMode;
  fan?: FanSpeed;
  setTemp?: number;
  /** true starts the sleep timer (aircon must be on), false cancels it. */
  sleepTimer?: boolean;
  zones?: Record<string, { open?: boolean; damper?: number }>;
}

const MODES = ['cool', 'heat', 'vent', 'dry'] as const;
const FANS = ['low', 'medium', 'high', 'auto'] as const;

/** Checks a decoded JSON body. Returns the request, or a message saying what's wrong. */
export function parseControl(body: unknown): ControlRequest | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return 'Send a JSON object.';
  }
  const raw = body as Record<string, unknown>;
  const request: ControlRequest = {};
  for (const key of Object.keys(raw)) {
    if (!['power', 'mode', 'fan', 'setTemp', 'sleepTimer', 'zones'].includes(key)) {
      return `Unknown field "${key}".`;
    }
  }
  if (raw.power !== undefined) {
    if (typeof raw.power !== 'boolean') {
      return '"power" must be true or false.';
    }
    request.power = raw.power;
  }
  if (raw.mode !== undefined) {
    if (!MODES.includes(raw.mode as UnitMode)) {
      return `"mode" must be one of ${MODES.join(', ')}.`;
    }
    request.mode = raw.mode as UnitMode;
  }
  if (raw.fan !== undefined) {
    if (!FANS.includes(raw.fan as FanSpeed)) {
      return `"fan" must be one of ${FANS.join(', ')}.`;
    }
    request.fan = raw.fan as FanSpeed;
  }
  if (raw.setTemp !== undefined) {
    if (typeof raw.setTemp !== 'number' || !Number.isFinite(raw.setTemp)) {
      return '"setTemp" must be a number.';
    }
    request.setTemp = raw.setTemp;
  }
  if (raw.sleepTimer !== undefined) {
    if (typeof raw.sleepTimer !== 'boolean') {
      return '"sleepTimer" must be true or false.';
    }
    request.sleepTimer = raw.sleepTimer;
  }
  if (raw.zones !== undefined) {
    if (typeof raw.zones !== 'object' || raw.zones === null || Array.isArray(raw.zones)) {
      return '"zones" must be an object keyed by zone id.';
    }
    request.zones = {};
    for (const [id, change] of Object.entries(raw.zones as Record<string, unknown>)) {
      const zone = change as Record<string, unknown> | null;
      if (!/^z\d\d$/.test(id) || typeof zone !== 'object' || zone === null) {
        return `Zone "${id}" must look like {"z01": {"open": true}}.`;
      }
      if (zone.open !== undefined && typeof zone.open !== 'boolean') {
        return `"zones.${id}.open" must be true or false.`;
      }
      if (zone.damper !== undefined && (typeof zone.damper !== 'number' || !Number.isFinite(zone.damper))) {
        return `"zones.${id}.damper" must be a number.`;
      }
      request.zones[id] = {
        ...(zone.open === undefined ? {} : { open: zone.open }),
        ...(zone.damper === undefined ? {} : { damper: zone.damper }),
      };
    }
  }
  return request;
}

/** Hands a checked request to the controller. Zone changes never start or stop the unit. */
export function applyControl(controller: EzoneController, request: ControlRequest, sleepTimerMinutes: number): void {
  const current = controller.current;
  if (request.mode !== undefined) {
    controller.setMode(request.mode);
  }
  if (request.power === true) {
    const mode = request.mode ?? current?.mode ?? 'cool';
    controller.setRun(mode === 'vent' || mode === 'dry' ? mode : 'climate');
  } else if (request.power === false) {
    controller.setRun('off');
  }
  if (request.fan !== undefined) {
    controller.setFan(request.fan);
  }
  if (request.setTemp !== undefined) {
    controller.setTemperature(request.setTemp);
  }
  if (request.sleepTimer === false) {
    controller.setOffCountdown(0);
  } else if (request.sleepTimer === true && (request.power ?? current?.power) === true) {
    controller.setOffCountdown(sleepTimerMinutes);
  }
  for (const [id, zone] of Object.entries(request.zones ?? {})) {
    if (zone.damper !== undefined) {
      controller.setZoneDamper(id, zone.damper);
    }
    if (zone.open !== undefined) {
      controller.setZoneOpen(id, zone.open);
    }
  }
}
