import type { AirconPatch } from './changes.ts';
import type { RawSystemData } from './model.ts';

const REQUEST_TIMEOUT_MS = 10_000;

export interface EzoneTransport {
  getSystemData(): Promise<RawSystemData>;
  setAircon(aircon: string, patch: AirconPatch): Promise<void>;
}

/**
 * The e-zone tablet's local HTTP API (the MyPlace app's API, port 2025). The tablet handles one request at a time
 * badly, so every call goes through a single queue.
 */
export class EzoneClient implements EzoneTransport {
  private readonly base: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(host: string, port: number) {
    this.base = `http://${host}:${port}`;
  }

  getSystemData(): Promise<RawSystemData> {
    return this.enqueue(async () => (await this.get('/getSystemData')) as RawSystemData);
  }

  setAircon(aircon: string, patch: AirconPatch): Promise<void> {
    const body: Record<string, unknown> = {};
    if (Object.keys(patch.info).length > 0) {
      body.info = patch.info;
    }
    if (Object.keys(patch.zones).length > 0) {
      body.zones = patch.zones;
    }
    const json = encodeURIComponent(JSON.stringify({ [aircon]: body }));
    return this.enqueue(async () => {
      const reply = (await this.get(`/setAircon?json=${json}`)) as { ack?: unknown; reason?: unknown };
      if (reply.ack !== true) {
        throw new Error(`the tablet refused the change${typeof reply.reason === 'string' ? `: ${reply.reason}` : ''}`);
      }
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async get(path: string): Promise<unknown> {
    const response = await fetch(`${this.base}${path}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${path.split('?')[0]}`);
    }
    return response.json();
  }
}
