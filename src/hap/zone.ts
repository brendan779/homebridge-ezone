import type { API } from 'homebridge';

import type { EzoneController } from '../ezone/controller.ts';
import type { Aircon, Zone } from '../ezone/model.ts';
import { AccessoryBase } from './common.ts';
import type { EzoneAccessory } from './common.ts';

/**
 * One tile per zone: tap opens or closes the damper, the speed slider sets its opening in 5 % steps.
 * Never starts or stops the aircon.
 */
export class ZoneAccessory extends AccessoryBase {
  private readonly zoneId: string;

  constructor(api: API, accessory: EzoneAccessory, controller: EzoneController, uid: string, zone: Zone) {
    super(api, accessory, controller, 'e-zone zone', `${uid}-${zone.id}`);
    this.zoneId = zone.id;
    const { Characteristic, Service } = api.hap;

    const fan = this.service(Service.Fanv2, accessory.displayName);
    fan.setPrimaryService(true);
    fan.getCharacteristic(Characteristic.Active)
      .onGet(() => this.read((a) => (this.zone(a)?.open === true ? 1 : 0)))
      .onSet((value) => controller.setZoneOpen(this.zoneId, value === 1));
    fan.getCharacteristic(Characteristic.RotationSpeed)
      .setProps({ minValue: 0, maxValue: 100, minStep: 5 })
      .onGet(() => this.read((a) => this.zone(a)?.damper ?? 100))
      .onSet((value) => {
        const percent = value as number;
        if (percent <= 0) {
          controller.setZoneOpen(this.zoneId, false);
        } else {
          controller.setZoneDamper(this.zoneId, percent);
          controller.setZoneOpen(this.zoneId, true);
        }
      });

    if (zone.temperature !== null) {
      const sensor = this.service(Service.TemperatureSensor, `${accessory.displayName} Temperature`);
      sensor.getCharacteristic(Characteristic.CurrentTemperature)
        .onGet(() => this.read((a) => this.zone(a)?.temperature ?? 0));
      fan.addLinkedService(sensor);
    } else {
      const sensor = accessory.getService(Service.TemperatureSensor);
      if (sensor !== undefined) {
        accessory.removeService(sensor);
      }
    }
  }

  update(aircon: Aircon): void {
    const zone = this.zone(aircon);
    if (zone === undefined) {
      return;
    }
    const { Characteristic, Service } = this.api.hap;
    const fan = this.accessory.getService(Service.Fanv2)!;
    fan.updateCharacteristic(Characteristic.Active, zone.open ? 1 : 0);
    fan.updateCharacteristic(Characteristic.RotationSpeed, zone.damper);
    if (zone.temperature !== null) {
      this.accessory.getService(Service.TemperatureSensor)?.updateCharacteristic(Characteristic.CurrentTemperature, zone.temperature);
    }
  }

  private zone(aircon: Aircon): Zone | undefined {
    return aircon.zones.find((zone) => zone.id === this.zoneId);
  }
}
