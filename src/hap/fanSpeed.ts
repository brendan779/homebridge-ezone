import type { API } from 'homebridge';

import type { EzoneController } from '../ezone/controller.ts';
import { fanToPercent, nextFan, percentToFan } from '../ezone/model.ts';
import type { Aircon } from '../ezone/model.ts';
import { AccessoryBase } from './common.ts';
import type { EzoneAccessory } from './common.ts';

/** A tap's on/off and a slider's speed can arrive together; within this window the slider wins. */
const TAP_WINDOW_MS = 400;

/**
 * Fan Speed tile. iOS 27 Home draws no fan control on an air conditioner, so speed gets its own fan tile:
 * a tap steps low → medium → high → auto, and the slider snaps to 25/50/75/100 % (100 % = auto).
 * It shows On while the aircon runs; a tap never turns the aircon on or off.
 */
export class FanSpeedAccessory extends AccessoryBase {
  private tapTimer: NodeJS.Timeout | undefined;

  constructor(api: API, accessory: EzoneAccessory, controller: EzoneController, uid: string) {
    super(api, accessory, controller, 'e-zone fan speed', `${uid}-fan`);
    const { Characteristic, Service } = api.hap;

    const fan = this.service(Service.Fanv2, accessory.displayName);
    fan.setPrimaryService(true);
    fan.getCharacteristic(Characteristic.Active)
      .onGet(() => this.read((a) => (a.power ? 1 : 0)))
      .onSet(() => {
        clearTimeout(this.tapTimer);
        this.tapTimer = setTimeout(() => {
          const current = controller.current;
          if (current !== null) {
            controller.setFan(nextFan(current.fan));
          }
        }, TAP_WINDOW_MS);
      });
    fan.getCharacteristic(Characteristic.RotationSpeed)
      .setProps({ minValue: 0, maxValue: 100, minStep: 25 })
      .onGet(() => this.read((a) => fanToPercent(a.fan)))
      .onSet((value) => {
        // A slider move, not a tap: cancel any pending step.
        clearTimeout(this.tapTimer);
        const percent = value as number;
        controller.setFan(percent > 0 ? percentToFan(percent) : (controller.current?.fan ?? 'auto'));
      });
    const { AUTO, MANUAL } = Characteristic.TargetFanState;
    fan.getCharacteristic(Characteristic.TargetFanState)
      .onGet(() => this.read((a) => (a.fan === 'auto' ? AUTO : MANUAL)))
      .onSet((value) => {
        clearTimeout(this.tapTimer);
        if (value === AUTO) {
          controller.setFan('auto');
        } else if (controller.current?.fan === 'auto') {
          controller.setFan('high');
        }
      });
  }

  update(aircon: Aircon): void {
    const { Characteristic, Service } = this.api.hap;
    const fan = this.accessory.getService(Service.Fanv2)!;
    fan.updateCharacteristic(Characteristic.Active, aircon.power ? 1 : 0);
    fan.updateCharacteristic(Characteristic.RotationSpeed, fanToPercent(aircon.fan));
    fan.updateCharacteristic(
      Characteristic.TargetFanState,
      aircon.fan === 'auto' ? Characteristic.TargetFanState.AUTO : Characteristic.TargetFanState.MANUAL,
    );
  }
}
