import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyPatch, buildPatch, emptyChanges } from './changes.ts';
import type { PendingChanges } from './changes.ts';
import { parseAircon } from './model.ts';
import type { Aircon } from './model.ts';
import { fixture } from './fixture.helpers.ts';

function off(): Aircon {
  return parseAircon(fixture(), 'ac1');
}

function changes(partial: Partial<PendingChanges>): PendingChanges {
  return { ...emptyChanges(), ...partial };
}

describe('buildPatch', () => {
  it('starts heat/cool in the remembered mode when the unit was off in fan-only', () => {
    const current = { ...off(), mode: 'vent' as const };
    assert.deepEqual(buildPatch(changes({ runs: ['climate'] }), current, 'heat').info, { state: 'on', mode: 'heat' });
  });

  it('a grouped-tile tap (all services on) starts heat/cool', () => {
    const patch = buildPatch(changes({ runs: ['climate', 'vent', 'dry'] }), off(), 'cool');
    assert.deepEqual(patch.info, { state: 'on', mode: 'cool' });
  });

  it('switches mode without repeating state when already on', () => {
    const current = { ...off(), power: true, mode: 'cool' as const };
    assert.deepEqual(buildPatch(changes({ runs: ['dry'] }), current, 'cool').info, { mode: 'dry' });
    assert.deepEqual(buildPatch(changes({ runs: ['off'] }), current, 'cool').info, { state: 'off' });
  });

  it('a Heat/Cool pick alone changes a running unit but not an off one', () => {
    const running = { ...off(), power: true, mode: 'cool' as const };
    assert.deepEqual(buildPatch(changes({ climateMode: 'heat' }), running, 'cool').info, { mode: 'heat' });
    assert.deepEqual(buildPatch(changes({ climateMode: 'heat' }), off(), 'cool').info, {});
    const venting = { ...running, mode: 'vent' as const };
    assert.deepEqual(buildPatch(changes({ climateMode: 'heat' }), venting, 'cool').info, {});
  });

  it('a Mac app mode pick switches a running unit, or only sets the mode of an off one', () => {
    const running = { ...off(), power: true, mode: 'cool' as const };
    assert.deepEqual(buildPatch(changes({ mode: 'dry' }), running, 'cool').info, { mode: 'dry' });
    assert.deepEqual(buildPatch(changes({ mode: 'heat' }), off(), 'cool').info, { mode: 'heat' });
    assert.deepEqual(buildPatch(changes({ mode: 'cool' }), off(), 'cool').info, {});
    assert.deepEqual(buildPatch(changes({ mode: 'vent', runs: ['vent'] }), off(), 'cool').info, { state: 'on', mode: 'vent' });
  });

  it('sends auto fan the way the tablet wants it', () => {
    const high = { ...off(), fan: 'high' as const };
    assert.deepEqual(buildPatch(changes({ fan: 'auto' }), high, 'cool').info, { fan: 'auto' });
    assert.deepEqual(buildPatch(changes({ fan: 'auto' }), { ...high, autoFanValue: 'autoAA' }, 'cool').info, { fan: 'autoAA' });
    assert.deepEqual(buildPatch(changes({ fan: 'auto' }), off(), 'cool').info, {});
  });

  it('clamps the setpoint and skips unchanged values', () => {
    assert.deepEqual(buildPatch(changes({ setTemp: 40 }), off(), 'cool').info, { setTemp: 32 });
    assert.deepEqual(buildPatch(changes({ setTemp: 20 }), off(), 'cool').info, {});
  });

  it('opens, closes and sizes zones without touching the unit', () => {
    const zones = new Map([
      ['z02', { open: true }],
      ['z04', { open: false }],
      ['z05', { damper: 43, open: true }],
      ['z99', { open: true }],
    ]);
    const patch = buildPatch(changes({ zones }), off(), 'cool');
    assert.deepEqual(patch.info, {});
    assert.deepEqual(patch.zones, { z02: { state: 'open' }, z04: { state: 'close' }, z05: { value: 45 } });
  });
});

describe('applyPatch', () => {
  it('shows the expected result before the tablet confirms', () => {
    const current = { ...off(), offCountdown: 0 };
    const next = applyPatch(current, { info: { state: 'on', mode: 'dry', fan: 'autoAA', countDownToOff: 120 }, zones: { z02: { state: 'open', value: 50 } } });
    assert.equal(next.power, true);
    assert.equal(next.mode, 'dry');
    assert.equal(next.fan, 'auto');
    assert.equal(next.offCountdown, 120);
    assert.deepEqual(next.zones[1], { ...current.zones[1], open: true, damper: 50 });
  });

  it('turning off clears the countdown', () => {
    const current = { ...off(), power: true, offCountdown: 30 };
    assert.equal(applyPatch(current, { info: { state: 'off' }, zones: {} }).offCountdown, 0);
  });
});
