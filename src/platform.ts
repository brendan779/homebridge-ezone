import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';

import { parseConfig } from './config.ts';
import type { PluginConfig } from './config.ts';
import { EzoneClient } from './ezone/client.ts';
import { EzoneController } from './ezone/controller.ts';
import type { Aircon } from './ezone/model.ts';
import { AirconAccessory } from './hap/aircon.ts';
import { Category } from './hap/common.ts';
import type { AccessoryContext, EzoneAccessory } from './hap/common.ts';
import { SleepTimerAccessory } from './hap/sleepTimer.ts';
import { ZoneAccessory } from './hap/zone.ts';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.ts';

type Handler = AirconAccessory | ZoneAccessory | SleepTimerAccessory;

/**
 * Builds the tiles from what the tablet reports (one Air Conditioner, one per zone, a Sleep Timer) and keeps them
 * in step with it.
 */
export class EzonePlatform implements DynamicPlatformPlugin {
  private readonly log: Logging;
  private readonly api: API;
  private readonly config: PluginConfig | null;
  private readonly cached = new Map<string, EzoneAccessory>();
  private readonly handlers = new Map<string, Handler>();
  private controller: EzoneController | null = null;
  private layout = '';

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;

    const parsed = parseConfig(config);
    parsed.warnings.forEach((warning) => log.warn(warning));
    parsed.errors.forEach((error) => log.error(error));
    this.config = parsed.errors.length === 0 ? parsed.config : null;
    if (this.config === null) {
      log.error('e-zone is idle until the configuration above is fixed.');
    }

    api.on('didFinishLaunching', () => this.start());
    api.on('shutdown', () => this.controller?.stop());
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.cached.set(accessory.UUID, accessory as EzoneAccessory);
  }

  private start(): void {
    if (this.config === null) {
      return;
    }
    const config = this.config;
    const airconCache = [...this.cached.values()].find((a) => a.context.kind === 'aircon');
    const lastClimateMode = airconCache?.context.kind === 'aircon' ? airconCache.context.lastClimateMode : undefined;

    this.controller = new EzoneController(new EzoneClient(config.host, config.port), {
      aircon: config.aircon,
      pollMs: config.pollSeconds * 1_000,
      lastClimateMode: lastClimateMode ?? 'cool',
      log: this.log,
      onUpdate: (aircon) => this.update(aircon),
      onClimateMode: (mode) => {
        for (const accessory of this.cached.values()) {
          if (accessory.context.kind === 'aircon') {
            accessory.context.lastClimateMode = mode;
          }
        }
      },
    });
    this.log.info(`Connecting to the e-zone tablet at ${config.host}:${config.port}.`);
    this.controller.start();
  }

  private update(aircon: Aircon): void {
    const layout = JSON.stringify([aircon.uid, aircon.zones.map((z) => [z.id, z.name, z.temperature !== null])]);
    if (layout !== this.layout) {
      this.layout = layout;
      this.buildAccessories(aircon);
    }
    for (const handler of this.handlers.values()) {
      handler.update(aircon);
    }
  }

  /** Creates the tiles the tablet calls for and removes any left over from an earlier layout. */
  private buildAccessories(aircon: Aircon): void {
    const controller = this.controller!;
    const config = this.config!;
    const wanted = new Set<string>();
    const fresh: EzoneAccessory[] = [];

    const ensure = (key: string, name: string, context: AccessoryContext, category: number): EzoneAccessory => {
      const uuid = this.api.hap.uuid.generate(`ezone:${aircon.uid}:${key}`);
      wanted.add(uuid);
      let accessory = this.cached.get(uuid);
      if (accessory === undefined) {
        accessory = new this.api.platformAccessory<AccessoryContext>(name, uuid, category);
        accessory.context = context;
        this.cached.set(uuid, accessory);
        fresh.push(accessory);
        this.log.info(`Adding "${name}".`);
      } else {
        accessory.context = { ...context, ...accessory.context };
      }
      return accessory;
    };

    const airconAccessory = ensure('aircon', 'Air Conditioner', { kind: 'aircon', uid: aircon.uid }, Category.AIR_CONDITIONER);
    this.handlers.set(airconAccessory.UUID, new AirconAccessory(this.api, airconAccessory, controller, aircon.uid));

    const timer = ensure('sleep-timer', 'Sleep Timer', { kind: 'sleepTimer', uid: aircon.uid }, Category.SWITCH);
    this.handlers.set(timer.UUID, new SleepTimerAccessory(this.api, timer, controller, aircon.uid, config.sleepTimerMinutes));

    for (const zone of aircon.zones) {
      const accessory = ensure(`zone:${zone.id}`, `${zone.name} Zone`, { kind: 'zone', uid: aircon.uid, zoneId: zone.id }, Category.FAN);
      this.handlers.set(accessory.UUID, new ZoneAccessory(this.api, accessory, controller, aircon.uid, zone));
    }

    if (fresh.length > 0) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, fresh);
    }
    const stale = [...this.cached.values()].filter((accessory) => !wanted.has(accessory.UUID));
    if (stale.length > 0) {
      stale.forEach((accessory) => {
        this.log.info(`Removing "${accessory.displayName}", which the tablet no longer reports.`);
        this.cached.delete(accessory.UUID);
        this.handlers.delete(accessory.UUID);
      });
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    }
    this.api.updatePlatformAccessories([...this.cached.values()].filter((a) => !fresh.includes(a)));
  }
}
