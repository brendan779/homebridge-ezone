import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AirconPatch } from '../ezone/changes.ts';
import { EzoneController } from '../ezone/controller.ts';
import { fixture } from '../ezone/fixture.helpers.ts';
import { applyControl, feedStatus, parseControl } from './control.ts';

const quiet = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

async function setup(power: boolean) {
  const data = fixture();
  data.aircons!.ac1!.info!.state = power ? 'on' : 'off';
  const writes: AirconPatch[] = [];
  const controller = new EzoneController(
    {
      getSystemData: () => Promise.resolve(structuredClone(data)),
      setAircon: (_ac, patch) => {
        writes.push(patch);
        return Promise.resolve();
      },
    },
    { aircon: 'ac1', pollMs: 60_000, confirmMs: 60_000, lastClimateMode: 'cool', log: quiet, onUpdate: () => undefined },
  );
  await controller.poll();
  return { controller, writes };
}

describe('parseControl', () => {
  it('accepts a full request', () => {
    assert.deepEqual(parseControl({ power: true, mode: 'dry', fan: 'auto', setTemp: 21, sleepTimer: false, zones: { z03: { open: true, damper: 50 } } }), {
      power: true, mode: 'dry', fan: 'auto', setTemp: 21, sleepTimer: false, zones: { z03: { open: true, damper: 50 } },
    });
  });

  it('explains what is wrong', () => {
    assert.match(parseControl([]) as string, /JSON object/);
    assert.match(parseControl({ mode: 'auto' }) as string, /"mode" must be one of/);
    assert.match(parseControl({ fan: 'turbo' }) as string, /"fan"/);
    assert.match(parseControl({ zones: { lounge: { open: true } } }) as string, /Zone "lounge"/);
    assert.match(parseControl({ zones: { z01: { open: 'yes' } } }) as string, /zones\.z01\.open/);
    assert.match(parseControl({ temp: 20 }) as string, /Unknown field "temp"/);
  });
});

describe('applyControl', () => {
  it('power on in a chosen mode is one write', async () => {
    const { controller, writes } = await setup(false);
    applyControl(controller, { power: true, mode: 'heat' }, 120);
    await controller.flush();
    controller.stop();
    assert.deepEqual(writes, [{ info: { state: 'on', mode: 'heat' }, zones: {} }]);
  });

  it('a mode pick while off does not start the unit', async () => {
    const { controller, writes } = await setup(false);
    applyControl(controller, { mode: 'dry' }, 120);
    await controller.flush();
    controller.stop();
    assert.deepEqual(writes, [{ info: { mode: 'dry' }, zones: {} }]);
  });

  it('the sleep timer needs the unit on', async () => {
    const off = await setup(false);
    applyControl(off.controller, { sleepTimer: true }, 120);
    await off.controller.flush();
    off.controller.stop();
    assert.deepEqual(off.writes, []);

    const on = await setup(true);
    applyControl(on.controller, { sleepTimer: true, zones: { z03: { open: true, damper: 40 } } }, 120);
    await on.controller.flush();
    on.controller.stop();
    assert.deepEqual(on.writes, [{ info: { countDownToOff: 120 }, zones: { z03: { state: 'open', value: 40 } } }]);
  });

  it('reports status for the app', async () => {
    const { controller } = await setup(true);
    const status = feedStatus(controller.current, controller.lastSuccessAt, 120, 60_000);
    controller.stop();
    assert.equal(status.online, true);
    assert.equal(status.aircon?.run, 'climate');
    assert.equal(status.aircon?.roomTemp, 20);
    assert.equal(status.zones.length, 8);
    assert.deepEqual(status.zones[0], { id: 'z01', name: 'Lounge', open: false, damper: 100, constant: true, temperature: null });
  });
});
