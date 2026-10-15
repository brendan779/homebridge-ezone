import type { API } from 'homebridge';

import { EzonePlatform } from './platform.ts';
import { PLATFORM_NAME } from './settings.ts';

/**
 * Registers the platform with Homebridge.
 */
export default (api: API): void => {
  api.registerPlatform(PLATFORM_NAME, EzonePlatform);
};
