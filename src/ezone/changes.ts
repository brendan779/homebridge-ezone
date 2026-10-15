import { clampSetTemp, damperStep, resolveRun } from './model.ts';
import type { Aircon, ClimateMode, FanSpeed, Run, UnitMode } from './model.ts';

/** Requests collected from Apple Home over a short window, sent to the tablet as one `setAircon`. */
export interface PendingChanges {
  runs: Run[];
  climateMode?: ClimateMode;
  fan?: FanSpeed;
  setTemp?: number;
  offCountdown?: number;
  zones: Map<string, { open?: boolean; damper?: number }>;
}

export function emptyChanges(): PendingChanges {
  return { runs: [], zones: new Map() };
}

export interface AirconPatch {
  info: Record<string, string | number>;
  zones: Record<string, Record<string, string | number>>;
}

export function isEmptyPatch(patch: AirconPatch): boolean {
  return Object.keys(patch.info).length === 0 && Object.keys(patch.zones).length === 0;
}

/**
 * Turns pending requests into the minimal `setAircon` body for the current state.
 * `lastClimateMode` is the heat/cool mode to start in when the unit is off or running fan-only/dry.
 */
export function buildPatch(changes: PendingChanges, current: Aircon, lastClimateMode: ClimateMode): AirconPatch {
  const info: Record<string, string | number> = {};
  const zones: Record<string, Record<string, string | number>> = {};

  const run = resolveRun(changes.runs);
  const climateMode = changes.climateMode ?? (current.mode === 'heat' || current.mode === 'cool' ? current.mode : lastClimateMode);
  const runningClimate = current.power && (current.mode === 'heat' || current.mode === 'cool');

  let targetMode: UnitMode | undefined;
  switch (run) {
    case 'climate':
      targetMode = climateMode;
      break;
    case 'vent':
    case 'dry':
      targetMode = run;
      break;
    case 'off':
      if (current.power) {
        info.state = 'off';
      }
      break;
    case undefined:
      // A Heat/Cool pick on its own only changes a unit that is already heating or cooling.
      if (changes.climateMode !== undefined && runningClimate) {
        targetMode = changes.climateMode;
      }
      break;
  }
  if (targetMode !== undefined) {
    if (!current.power) {
      info.state = 'on';
    }
    if (targetMode !== current.mode || !current.power) {
      info.mode = targetMode;
    }
  }

  if (changes.fan !== undefined && changes.fan !== current.fan) {
    info.fan = changes.fan === 'auto' ? current.autoFanValue : changes.fan;
  }
  if (changes.setTemp !== undefined) {
    const setTemp = clampSetTemp(changes.setTemp);
    if (setTemp !== current.setTemp) {
      info.setTemp = setTemp;
    }
  }
  if (changes.offCountdown !== undefined && changes.offCountdown !== current.offCountdown) {
    info.countDownToOff = changes.offCountdown;
  }

  for (const [id, change] of changes.zones) {
    const zone = current.zones.find((z) => z.id === id);
    if (zone === undefined) {
      continue;
    }
    const body: Record<string, string | number> = {};
    if (change.open !== undefined && change.open !== zone.open) {
      body.state = change.open ? 'open' : 'close';
    }
    if (change.damper !== undefined) {
      const damper = damperStep(change.damper);
      if (damper !== zone.damper) {
        body.value = damper;
      }
    }
    if (Object.keys(body).length > 0) {
      zones[id] = body;
    }
  }

  return { info, zones };
}

/** The state Apple Home should show straight away, before the tablet confirms the write. */
export function applyPatch(current: Aircon, patch: AirconPatch): Aircon {
  const { info } = patch;
  return {
    ...current,
    power: info.state === undefined ? current.power : info.state === 'on',
    mode: typeof info.mode === 'string' ? (info.mode as UnitMode) : current.mode,
    fan: typeof info.fan === 'string' ? (info.fan.startsWith('auto') ? 'auto' : (info.fan as FanSpeed)) : current.fan,
    setTemp: typeof info.setTemp === 'number' ? info.setTemp : current.setTemp,
    offCountdown: info.state === 'off' ? 0 : typeof info.countDownToOff === 'number' ? info.countDownToOff : current.offCountdown,
    zones: current.zones.map((zone) => {
      const body = patch.zones[zone.id];
      if (body === undefined) {
        return zone;
      }
      return {
        ...zone,
        open: body.state === undefined ? zone.open : body.state === 'open',
        damper: typeof body.value === 'number' ? body.value : zone.damper,
      };
    }),
  };
}
