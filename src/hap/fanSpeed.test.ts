import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as hap from '@homebridge/hap-nodejs';
import type { API } from 'homebridge';

import type { AirconPatch } from '../ezone/changes.ts';
import { EzoneController } from '../ezone/controller.ts';
import { fixture } from '../ezone/fixture.helpers.ts';
import type { EzoneAccessory } from './common.ts';
import { FanSpeedAccessory } from './fanSpeed.ts';

const quiet = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

async function setup() {
  const data = fixture();
  data.aircons!.ac1!.info!.state = 'on';
  const writes: AirconPatch[] = [];
  const controller = new EzoneController(
    {
      getSystemData: () => Promise.resolve(structuredClone(data)),
      setAircon: (_ac, patch) => {
        writes.push(patch);
        return Promise.resolve();
      },
    },
    { aircon: 'ac1', pollMs: 60_000, confirmMs: 60_000, batchMs: 10, lastClimateMode: 'cool', log: quiet, onUpdate: () => undefined },
  );
  await controller.poll();
  const accessory = new hap.Accessory('Fan Speed', hap.uuid.generate('test-fan')) as unknown as EzoneAccessory;
  new FanSpeedAccessory({ hap } as unknown as API, accessory, controller, 'uid');
  const fan = accessory.getService(hap.Service.Fanv2)!;
  return { controller, writes, fan };
}

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Fan Speed tile', () => {
  it('a tap steps auto → low', async () => {
    const { controller, writes, fan } = await setup();
    fan.getCharacteristic(hap.Characteristic.Active).setValue(0);
    await settle(600);
    controller.stop();
    assert.deepEqual(writes, [{ info: { fan: 'low' }, zones: {} }]);
  });

  it('a slider move is not mistaken for a tap', async () => {
    const { controller, writes, fan } = await setup();
    fan.getCharacteristic(hap.Characteristic.Active).setValue(1);
    fan.getCharacteristic(hap.Characteristic.RotationSpeed).setValue(75);
    await settle(600);
    controller.stop();
    assert.deepEqual(writes, [{ info: { fan: 'high' }, zones: {} }]);
  });
});
