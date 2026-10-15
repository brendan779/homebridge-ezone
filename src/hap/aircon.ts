import type { API, CharacteristicValue } from 'homebridge';

import type { EzoneController } from '../ezone/controller.ts';
import { MAX_SET_TEMP, MIN_SET_TEMP, fanToPercent, percentToFan, roomTemperature, runOf } from '../ezone/model.ts';
import type { Aircon } from '../ezone/model.ts';
import { AccessoryBase } from './common.ts';
import type { EzoneAccessory } from './common.ts';

/**
 * The single Air Conditioner tile: a Heater Cooler (heat/cool) with linked "Fan Only" and "Dry" services.
 * At most one of the three is on; each one's off switch turns the unit off.
 */
export class AirconAccessory extends AccessoryBase {
  constructor(api: API, accessory: EzoneAccessory, controller: EzoneController, uid: string) {
    super(api, accessory, controller, 'e-zone', uid);
    const { Characteristic, Service } = api.hap;
    const name = accessory.displayName;

    const climate = this.service(Service.HeaterCooler, name, 'climate');
    climate.setPrimaryService(true);

    climate.getCharacteristic(Characteristic.Active)
      .onGet(() => this.read((a) => (runOf(a) === 'climate' ? 1 : 0)))
      .onSet((value) => controller.setRun(value === 1 ? 'climate' : 'off'));

    climate.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .onGet(() => this.read((a) => this.currentState(a)));

    const { HEAT, COOL } = Characteristic.TargetHeaterCoolerState;
    climate.getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .setProps({ validValues: [HEAT, COOL] })
      .onGet(() => this.read((a) => (this.climateMode(a) === 'heat' ? HEAT : COOL)))
      .onSet((value) => controller.setClimateMode(value === HEAT ? 'heat' : 'cool'));

    climate.getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(() => this.read(roomTemperature));

    for (const threshold of [Characteristic.CoolingThresholdTemperature, Characteristic.HeatingThresholdTemperature]) {
      climate.getCharacteristic(threshold)
        .setProps({ minValue: MIN_SET_TEMP, maxValue: MAX_SET_TEMP, minStep: 1 })
        .onGet(() => this.read((a) => a.setTemp))
        .onSet((value) => controller.setTemperature(value as number));
    }

    climate.getCharacteristic(Characteristic.RotationSpeed)
      .setProps({ minValue: 0, maxValue: 100, minStep: 25 })
      .onGet(() => this.read((a) => fanToPercent(a.fan)))
      .onSet((value) => this.setSpeed(value));

    const fan = this.service(Service.Fanv2, 'Fan Only', 'vent');
    fan.getCharacteristic(Characteristic.Active)
      .onGet(() => this.read((a) => (runOf(a) === 'vent' ? 1 : 0)))
      .onSet((value) => controller.setRun(value === 1 ? 'vent' : 'off'));
    fan.getCharacteristic(Characteristic.RotationSpeed)
      .setProps({ minValue: 0, maxValue: 100, minStep: 25 })
      .onGet(() => this.read((a) => fanToPercent(a.fan)))
      .onSet((value) => this.setSpeed(value));
    const { AUTO, MANUAL } = Characteristic.TargetFanState;
    fan.getCharacteristic(Characteristic.TargetFanState)
      .onGet(() => this.read((a) => (a.fan === 'auto' ? AUTO : MANUAL)))
      .onSet((value) => {
        // Leaving auto needs a fixed speed; medium is the tablet's middle ground.
        if (value === AUTO) {
          controller.setFan('auto');
        } else if (controller.current?.fan === 'auto') {
          controller.setFan('medium');
        }
      });

    const dry = this.service(Service.Switch, 'Dry', 'dry');
    dry.getCharacteristic(Characteristic.On)
      .onGet(() => this.read((a) => runOf(a) === 'dry'))
      .onSet((value) => controller.setRun(value === true ? 'dry' : 'off'));

    climate.addLinkedService(fan);
    climate.addLinkedService(dry);
  }

  update(aircon: Aircon): void {
    const { Characteristic, Service } = this.api.hap;
    const run = runOf(aircon);
    const climate = this.accessory.getServiceById(Service.HeaterCooler, 'climate')!;
    climate.updateCharacteristic(Characteristic.Active, run === 'climate' ? 1 : 0);
    climate.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, this.currentState(aircon));
    climate.updateCharacteristic(
      Characteristic.TargetHeaterCoolerState,
      this.climateMode(aircon) === 'heat' ? Characteristic.TargetHeaterCoolerState.HEAT : Characteristic.TargetHeaterCoolerState.COOL,
    );
    climate.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature(aircon));
    climate.updateCharacteristic(Characteristic.CoolingThresholdTemperature, aircon.setTemp);
    climate.updateCharacteristic(Characteristic.HeatingThresholdTemperature, aircon.setTemp);
    climate.updateCharacteristic(Characteristic.RotationSpeed, fanToPercent(aircon.fan));

    const fan = this.accessory.getServiceById(Service.Fanv2, 'vent')!;
    fan.updateCharacteristic(Characteristic.Active, run === 'vent' ? 1 : 0);
    fan.updateCharacteristic(Characteristic.RotationSpeed, fanToPercent(aircon.fan));
    fan.updateCharacteristic(
      Characteristic.TargetFanState,
      aircon.fan === 'auto' ? Characteristic.TargetFanState.AUTO : Characteristic.TargetFanState.MANUAL,
    );

    this.accessory.getServiceById(Service.Switch, 'dry')!.updateCharacteristic(Characteristic.On, run === 'dry');
  }

  private setSpeed(value: CharacteristicValue): void {
    const percent = value as number;
    if (percent > 0) {
      this.controller.setFan(percentToFan(percent));
    } else {
      // 0 % is Home's way of switching off; the Active characteristic handles that, so just restore the slider.
      this.controller.setFan(this.controller.current?.fan ?? 'auto');
    }
  }

  /** Heat/cool to show on the picker: the running mode, else the one the unit will start in. */
  private climateMode(aircon: Aircon): 'heat' | 'cool' {
    return aircon.mode === 'heat' || aircon.mode === 'cool' ? aircon.mode : this.controller.lastClimateMode;
  }

  private currentState(aircon: Aircon): number {
    const { CurrentHeaterCoolerState } = this.api.hap.Characteristic;
    if (runOf(aircon) !== 'climate') {
      return CurrentHeaterCoolerState.INACTIVE;
    }
    return aircon.mode === 'heat' ? CurrentHeaterCoolerState.HEATING : CurrentHeaterCoolerState.COOLING;
  }
}
