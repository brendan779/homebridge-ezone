import type { API, CharacteristicValue, HAPStatus, PlatformAccessory, Service, WithUUID } from 'homebridge';

import type { EzoneController } from '../ezone/controller.ts';
import type { Aircon, ClimateMode } from '../ezone/model.ts';

export type AccessoryContext =
  | { kind: 'aircon'; uid: string; lastClimateMode?: ClimateMode }
  | { kind: 'zone'; uid: string; zoneId: string }
  | { kind: 'sleepTimer'; uid: string };

export type EzoneAccessory = PlatformAccessory<AccessoryContext>;

/** Home shows "No Response" once the tablet has been unreadable this long. */
export const STALE_AFTER_MS = 2 * 60_000;

/** HAPStatus.SERVICE_COMMUNICATION_FAILURE ("No Response"); a const enum, so not reachable as a value here. */
const SERVICE_COMMUNICATION_FAILURE = -70402 as HAPStatus;

/** Accessory categories (also const enums in HAP-NodeJS). */
export const Category = { FAN: 3, SWITCH: 8, AIR_CONDITIONER: 21 } as const;

/** A concrete service class such as `Service.Fanv2`. */
type ServiceType = WithUUID<new (displayName?: string, subtype?: string) => Service>;

/** Shared plumbing for the accessory classes: reading state for `onGet` and naming services. */
export class AccessoryBase {
  protected readonly api: API;
  protected readonly accessory: EzoneAccessory;
  protected readonly controller: EzoneController;

  constructor(api: API, accessory: EzoneAccessory, controller: EzoneController, model: string, serial: string) {
    this.api = api;
    this.accessory = accessory;
    this.controller = controller;
    const { Characteristic, Service } = api.hap;
    accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Advantage Air')
      .setCharacteristic(Characteristic.Model, model)
      .setCharacteristic(Characteristic.SerialNumber, serial);
  }

  /** Current tablet state for an `onGet`, or "No Response" when there is none worth showing. */
  protected read<T extends CharacteristicValue>(pick: (aircon: Aircon) => T): T {
    const current = this.controller.current;
    if (current === null || Date.now() - this.controller.lastSuccessAt > STALE_AFTER_MS) {
      throw new this.api.hap.HapStatusError(SERVICE_COMMUNICATION_FAILURE);
    }
    return pick(current);
  }

  /** Gets or adds a service, giving it a name Home shows inside a grouped tile (ConfiguredName). */
  protected service(type: ServiceType, name: string, subtype?: string): Service {
    const { Characteristic } = this.api.hap;
    // Cached services can come back with '' for no subtype.
    const existing = this.accessory.services.find((s) => s.UUID === type.UUID && (s.subtype || undefined) === subtype);
    const service = existing ?? this.accessory.addService(new type(name, subtype));
    if (!service.testCharacteristic(Characteristic.ConfiguredName)) {
      service.addOptionalCharacteristic(Characteristic.ConfiguredName);
      service.setCharacteristic(Characteristic.ConfiguredName, name);
    }
    service.setCharacteristic(Characteristic.Name, name);
    return service;
  }
}
