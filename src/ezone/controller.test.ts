import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AirconPatch } from './changes.ts';
import type { EzoneTransport } from './client.ts';
import { EzoneController } from './controller.ts';
import { fixture } from './fixture.helpers.ts';
import type { Aircon, ClimateMode, RawSystemData } from './model.ts';

/** A tablet in memory that records writes and can hold a read open to test ordering. */
class FakeTablet implements EzoneTransport {
  data: RawSystemData = fixture();
  writes: AirconPatch[] = [];
  failWrites = 0;
  private heldRead: (() => void) | undefined;
  holdNextRead = false;

  async getSystemData(): Promise<RawSystemData> {
    const snapshot = structuredClone(this.data);
    if (this.holdNextRead) {
      this.holdNextRead = false;
      await new Promise<void>((resolve) => (this.heldRead = resolve));
    }
    return snapshot;
  }

  setAircon(_aircon: string, patch: AirconPatch): Promise<void> {
    if (this.failWrites > 0) {
      this.failWrites--;
      return Promise.reject(new Error('timeout'));
    }
    this.writes.push(patch);
    const ac = this.data.aircons!.ac1!;
    Object.assign(ac.info!, patch.info);
    for (const [id, body] of Object.entries(patch.zones)) {
      Object.assign(ac.zones![id]!, body);
    }
    return Promise.resolve();
  }

  releaseRead(): void {
    this.heldRead?.();
  }
}

const quiet = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

function setup(lastClimateMode: ClimateMode = 'cool') {
  const tablet = new FakeTablet();
  const updates: Aircon[] = [];
  const modes: ClimateMode[] = [];
  const controller = new EzoneController(tablet, {
    aircon: 'ac1', pollMs: 60_000, lastClimateMode, log: quiet,
    onUpdate: (a) => updates.push(a),
    onClimateMode: (m) => modes.push(m),
  });
  return { tablet, controller, updates, modes };
}

describe('EzoneController', () => {
  it('batches a grouped-tile tap into one write that starts heat/cool', async () => {
    const { tablet, controller, updates } = setup('heat');
    // Off, last run in fan-only: heat/cool should resume the remembered heat.
    tablet.data.aircons!.ac1!.info!.mode = 'vent';
    await controller.poll();
    controller.setRun('climate');
    controller.setRun('vent');
    controller.setRun('dry');
    await controller.flush();
    controller.stop();
    assert.deepEqual(tablet.writes, [{ info: { state: 'on', mode: 'heat' }, zones: {} }]);
    assert.equal(updates.at(-1)?.power, true);
    assert.equal(updates.at(-1)?.mode, 'heat');
  });

  it('drops a read that started before a write, so Home does not flick back', async () => {
    const { tablet, controller, updates } = setup();
    await controller.poll();
    tablet.holdNextRead = true;
    const staleRead = controller.poll();
    controller.setZoneOpen('z02', true);
    await controller.flush();
    tablet.releaseRead();
    await staleRead;
    controller.stop();
    assert.equal(updates.at(-1)?.zones[1]?.open, true);
  });

  it('retries a failed write', async () => {
    const { tablet, controller } = setup();
    await controller.poll();
    tablet.failWrites = 1;
    controller.setTemperature(22);
    await controller.flush();
    controller.stop();
    assert.deepEqual(tablet.writes, [{ info: { setTemp: 22 }, zones: {} }]);
  });

  it('remembers the last heat/cool mode the tablet reports', async () => {
    const { tablet, controller, modes } = setup('cool');
    tablet.data.aircons!.ac1!.info!.mode = 'heat';
    await controller.poll();
    controller.stop();
    assert.equal(controller.lastClimateMode, 'heat');
    assert.deepEqual(modes, ['heat']);
  });

  it('re-sends the current state when a request changes nothing', async () => {
    const { tablet, controller, updates } = setup();
    await controller.poll();
    const before = updates.length;
    controller.setFan('auto');
    await controller.flush();
    controller.stop();
    assert.equal(tablet.writes.length, 0);
    assert.equal(updates.length, before + 1);
  });
});
