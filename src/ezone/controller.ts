import { applyPatch, buildPatch, emptyChanges, isEmptyPatch } from './changes.ts';
import type { PendingChanges } from './changes.ts';
import type { EzoneTransport } from './client.ts';
import { parseAircon } from './model.ts';
import type { Aircon, ClimateMode, FanSpeed, Run } from './model.ts';

export interface ControllerOptions {
  aircon: string;
  pollMs: number;
  /** Requests closer together than this are sent as one change (a grouped-tile tap arrives as several). */
  batchMs?: number;
  /** Re-read the tablet this long after a write so Home shows what the tablet actually did. */
  confirmMs?: number;
  lastClimateMode: ClimateMode;
  onUpdate: (aircon: Aircon) => void;
  onClimateMode?: (mode: ClimateMode) => void;
  log: { debug(message: string): void; warn(message: string): void; error(message: string): void; info(message: string): void };
}

const WRITE_ATTEMPTS = 3;

/**
 * Owns the conversation with the tablet: polls it, batches Home's requests into single writes, shows the expected
 * result straight away, then confirms it with a fresh read.
 */
export class EzoneController {
  private readonly transport: EzoneTransport;
  private readonly options: Required<Omit<ControllerOptions, 'onClimateMode'>> & Pick<ControllerOptions, 'onClimateMode'>;
  private state: Aircon | null = null;
  private pending: PendingChanges = emptyChanges();
  private batchTimer: NodeJS.Timeout | undefined;
  private pollTimer: NodeJS.Timeout | undefined;
  /** Bumped on every write; a read that started before the latest write is stale and dropped. */
  private generation = 0;
  private stopped = false;
  private failing = false;
  lastSuccessAt = 0;

  constructor(transport: EzoneTransport, options: ControllerOptions) {
    this.transport = transport;
    this.options = { batchMs: 250, confirmMs: 1_500, ...options };
  }

  get current(): Aircon | null {
    return this.state;
  }

  get lastClimateMode(): ClimateMode {
    return this.options.lastClimateMode;
  }

  start(): void {
    this.stopped = false;
    this.schedulePoll(0);
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    clearTimeout(this.batchTimer);
  }

  setRun(run: Run): void {
    this.pending.runs.push(run);
    this.scheduleFlush();
  }

  setClimateMode(mode: ClimateMode): void {
    this.pending.climateMode = mode;
    this.rememberClimateMode(mode);
    this.scheduleFlush();
  }

  setFan(fan: FanSpeed): void {
    this.pending.fan = fan;
    this.scheduleFlush();
  }

  setTemperature(value: number): void {
    this.pending.setTemp = value;
    this.scheduleFlush();
  }

  setOffCountdown(minutes: number): void {
    this.pending.offCountdown = minutes;
    this.scheduleFlush();
  }

  setZoneOpen(id: string, open: boolean): void {
    this.pending.zones.set(id, { ...this.pending.zones.get(id), open });
    this.scheduleFlush();
  }

  setZoneDamper(id: string, damper: number): void {
    this.pending.zones.set(id, { ...this.pending.zones.get(id), damper });
    this.scheduleFlush();
  }

  /** Reads the tablet now; used at start-up and by tests. */
  async poll(): Promise<void> {
    const generation = this.generation;
    try {
      const data = await this.transport.getSystemData();
      const aircon = parseAircon(data, this.options.aircon);
      this.lastSuccessAt = Date.now();
      if (this.failing) {
        this.failing = false;
        this.options.log.info('e-zone tablet is reachable again.');
      }
      if (generation !== this.generation) {
        return;
      }
      this.accept(aircon);
    } catch (error) {
      if (!this.failing) {
        this.failing = true;
        this.options.log.warn(`Can't read the e-zone tablet: ${describe(error)}. Retrying every poll.`);
      } else {
        this.options.log.debug(`e-zone read failed again: ${describe(error)}`);
      }
    }
  }

  /** Sends whatever is pending now instead of waiting for the batch window; used by tests. */
  async flush(): Promise<void> {
    clearTimeout(this.batchTimer);
    this.batchTimer = undefined;
    const changes = this.pending;
    this.pending = emptyChanges();
    const current = this.state;
    if (current === null) {
      this.options.log.warn('Ignoring a change from Apple Home: the e-zone tablet hasn\'t been read yet.');
      return;
    }

    const patch = buildPatch(changes, current, this.options.lastClimateMode);
    if (isEmptyPatch(patch)) {
      // Nothing to send, but Home may be showing a value it was refused (e.g. a speed of 0); put it right.
      this.options.onUpdate(current);
      return;
    }

    this.generation++;
    this.accept(applyPatch(current, patch));
    this.options.log.debug(`setAircon ${JSON.stringify(patch)}`);

    for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
      try {
        await this.transport.setAircon(this.options.aircon, patch);
        break;
      } catch (error) {
        if (attempt === WRITE_ATTEMPTS) {
          this.options.log.error(`Couldn't change the aircon: ${describe(error)}`);
        } else {
          await delay(1_000);
        }
      }
    }
    this.generation++;
    this.schedulePoll(this.options.confirmMs);
  }

  private accept(aircon: Aircon): void {
    if (aircon.mode === 'heat' || aircon.mode === 'cool') {
      this.rememberClimateMode(aircon.mode);
    }
    if (aircon.errorCode !== (this.state?.errorCode ?? '')) {
      if (aircon.errorCode === '') {
        this.options.log.info('The aircon fault has cleared.');
      } else {
        this.options.log.error(`The aircon reports fault "${aircon.errorCode}". Check the e-zone tablet.`);
      }
    }
    this.state = aircon;
    this.options.onUpdate(aircon);
  }

  private rememberClimateMode(mode: ClimateMode): void {
    if (mode !== this.options.lastClimateMode) {
      this.options.lastClimateMode = mode;
      this.options.onClimateMode?.(mode);
    }
  }

  private scheduleFlush(): void {
    if (this.batchTimer === undefined) {
      this.batchTimer = setTimeout(() => void this.flush(), this.options.batchMs);
    }
  }

  private schedulePoll(ms: number): void {
    if (this.stopped) {
      return;
    }
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => {
      void this.poll().finally(() => this.schedulePoll(this.options.pollMs));
    }, ms);
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : '';
    return `${error.message}${cause}`;
  }
  return String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
