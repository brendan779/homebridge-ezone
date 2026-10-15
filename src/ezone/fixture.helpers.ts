import { readFileSync } from 'node:fs';

import type { RawSystemData } from './model.ts';

/** A fresh copy of the 8-zone, no-sensor tablet reply in test/fixtures. */
export function fixture(): RawSystemData {
  return JSON.parse(readFileSync(new URL('../../test/fixtures/eight-zones-no-sensors.json', import.meta.url), 'utf8')) as RawSystemData;
}
