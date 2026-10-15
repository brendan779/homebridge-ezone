import type { API } from 'homebridge';

import type { EzoneController } from '../ezone/controller.ts';
import type { Aircon } from '../ezone/model.ts';
import { AccessoryBase } from './common.ts';
import type { EzoneAccessory } from './common.ts';

/** How long a refused "on" stays visible before the switch springs back, so the tap doesn't look ignored. */
const SPRING_BACK_MS = 700;

/**
 * One-tap sleep timer: on starts the e-zone's own off-countdown (so the tablet shows it too), off cancels it.
 * With the aircon off there is nothing to time, so the switch springs back.
 */
export class SleepTimerAccessory extends AccessoryBase {
  constructor(api: API, accessory: EzoneAccessory, controller: EzoneController, uid: string, minutes: number) {
    super(api, accessory, controller, 'e-zone sleep timer', `${uid}-sleep`);
    const { Characteristic, Service } = api.hap;

    const toggle = this.service(Service.Switch, accessory.displayName);
    toggle.setPrimaryService(true);
    toggle.getCharacteristic(Characteristic.On)
      .onGet(() => this.read(isRunning))
      .onSet((value) => {
        if (value !== true) {
          controller.setOffCountdown(0);
        } else if (controller.current?.power === true) {
          controller.setOffCountdown(minutes);
        } else {
          setTimeout(() => toggle.updateCharacteristic(Characteristic.On, false), SPRING_BACK_MS);
        }
      });
  }

  update(aircon: Aircon): void {
    const { Characteristic, Service } = this.api.hap;
    this.accessory.getService(Service.Switch)!.updateCharacteristic(Characteristic.On, isRunning(aircon));
  }
}

function isRunning(aircon: Aircon): boolean {
  return aircon.power && aircon.offCountdown > 0;
}
