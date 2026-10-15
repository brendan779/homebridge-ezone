import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fixture } from './fixture.helpers.ts';
import {
  damperStep, fanToPercent, nextFan, parseAircon, percentToFan, resolveRun, roomTemperature, runOf, titleCase,
} from './model.ts';

describe('parseAircon', () => {
  it('reads the unit and its zones in tablet order', () => {
    const aircon = parseAircon(fixture(), 'ac1');
    assert.equal(aircon.power, false);
    assert.equal(aircon.mode, 'cool');
    assert.equal(aircon.fan, 'auto');
    assert.equal(aircon.setTemp, 20);
    assert.deepEqual(aircon.zones.map((z) => z.name), [
      'Lounge', 'Sitting', 'Media', 'Rumpus', 'Master Bed', 'Winters Room', 'Bed 3', 'Bed 4',
    ]);
    assert.deepEqual(aircon.zones.filter((z) => z.open).map((z) => z.id), ['z04', 'z05']);
    assert.equal(aircon.zones[0]?.constant, true);
    assert.equal(aircon.zones[1]?.constant, true);
    assert.equal(aircon.zones[2]?.constant, false);
    assert.ok(aircon.zones.every((z) => z.temperature === null));
  });

  it('ignores zone slots beyond noOfZones', () => {
    const data = fixture();
    data.aircons!.ac1!.zones!.z09 = { name: 'SPARE', number: 9, state: 'close', value: 100 };
    assert.equal(parseAircon(data, 'ac1').zones.length, 8);
  });

  it('treats autoAA as automatic fan and remembers which value to send', () => {
    const data = fixture();
    Object.assign(data.aircons!.ac1!.info!, { fan: 'autoAA', aaAutoFanModeEnabled: true });
    const aircon = parseAircon(data, 'ac1');
    assert.equal(aircon.fan, 'auto');
    assert.equal(aircon.autoFanValue, 'autoAA');
  });

  it('rejects a reply without the aircon', () => {
    assert.throws(() => parseAircon({ aircons: {} }, 'ac1'), /no aircon "ac1"/);
  });
});

describe('room temperature', () => {
  it('falls back to the setpoint when no zone has a sensor', () => {
    assert.equal(roomTemperature(parseAircon(fixture(), 'ac1')), 20);
  });

  it('prefers the constant zone sensor, else averages sensors', () => {
    const data = fixture();
    const zones = data.aircons!.ac1!.zones!;
    Object.assign(zones.z03!, { type: 1, rssi: 40, measuredTemp: 24 });
    Object.assign(zones.z06!, { type: 1, rssi: 40, measuredTemp: 25 });
    assert.equal(roomTemperature(parseAircon(data, 'ac1')), 24.5);
    Object.assign(zones.z01!, { type: 1, rssi: 40, measuredTemp: 22.3 });
    assert.equal(roomTemperature(parseAircon(data, 'ac1')), 22.3);
  });
});

describe('runs', () => {
  it('maps power and mode to one Home service', () => {
    const aircon = parseAircon(fixture(), 'ac1');
    assert.equal(runOf(aircon), 'off');
    assert.equal(runOf({ ...aircon, power: true, mode: 'heat' }), 'climate');
    assert.equal(runOf({ ...aircon, power: true, mode: 'vent' }), 'vent');
    assert.equal(runOf({ ...aircon, power: true, mode: 'dry' }), 'dry');
  });

  it('lets on beat off and heat/cool beat fan-only beat dry', () => {
    assert.equal(resolveRun(['off', 'dry', 'vent', 'climate']), 'climate');
    assert.equal(resolveRun(['off', 'dry']), 'dry');
    assert.equal(resolveRun(['off', 'off']), 'off');
    assert.equal(resolveRun([]), undefined);
  });
});

describe('sliders', () => {
  it('round-trips the four fan stops', () => {
    for (const fan of ['low', 'medium', 'high', 'auto'] as const) {
      assert.equal(percentToFan(fanToPercent(fan)), fan);
    }
    assert.equal(percentToFan(1), 'low');
    assert.equal(percentToFan(60), 'medium');
  });

  it('cycles fan speeds for tile taps', () => {
    assert.equal(nextFan('low'), 'medium');
    assert.equal(nextFan('high'), 'auto');
    assert.equal(nextFan('auto'), 'low');
  });

  it('rounds dampers to 5 % steps within 5–100', () => {
    assert.equal(damperStep(0), 5);
    assert.equal(damperStep(42), 40);
    assert.equal(damperStep(43), 45);
    assert.equal(damperStep(130), 100);
  });

  it('title-cases tablet names', () => {
    assert.equal(titleCase('WINTERS  ROOM'), 'Winters Room');
    assert.equal(titleCase('TV RM'), 'TV RM');
    assert.equal(titleCase('McKenzie Room'), 'McKenzie Room');
  });
});
