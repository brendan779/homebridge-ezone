import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';

import type { EzoneController } from '../ezone/controller.ts';
import { applyControl, feedStatus, parseControl } from './control.ts';

export interface FeedLog {
  info(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

export interface ControlServerOptions {
  port: number;
  controller: EzoneController;
  sleepTimerMinutes: number;
  staleAfterMs: number;
  log: FeedLog;
}

const MAX_BODY_BYTES = 8_192;

/**
 * Local status and control for the macOS menu bar app: `GET /status` and `POST /control`. Changes go through the
 * same controller as Apple Home, so the tablet keeps a single poller and every view agrees.
 */
export class ControlServer {
  private readonly options: ControlServerOptions;
  private server: Server | null = null;

  constructor(options: ControlServerOptions) {
    this.options = options;
  }

  start(): Promise<boolean> {
    const { log, port } = this.options;
    const server = createServer({ headersTimeout: 10_000, requestTimeout: 10_000 }, (request, response) => {
      void this.handle(request, response);
    });
    this.server = server;
    return new Promise((resolve) => {
      server.once('error', (error: NodeJS.ErrnoException) => {
        this.server = null;
        log.error(error.code === 'EADDRINUSE'
          ? `Mac app access: port ${port} is already in use, so it's off. Choose another port in the plugin settings.`
          : `Mac app access: couldn't listen on port ${port}: ${error.message}`);
        resolve(false);
      });
      server.listen({ port }, () => {
        const hosts = lanAddresses();
        log.info(`Mac app access: http://${hosts[0] ?? 'this-host'}:${port} (status at /status).`);
        resolve(true);
      });
    });
  }

  stop(): void {
    this.server?.close();
    this.server?.closeAllConnections();
    this.server = null;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const path = new URL(request.url ?? '/', 'http://feed.invalid').pathname;
    const { controller, sleepTimerMinutes, staleAfterMs, log } = this.options;
    const status = () => feedStatus(controller.current, controller.lastSuccessAt, sleepTimerMinutes, staleAfterMs);

    if (path === '/status' && (request.method === 'GET' || request.method === 'HEAD')) {
      send(response, 200, status());
      return;
    }
    if (path === '/control' && request.method === 'POST') {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(request));
      } catch (error) {
        send(response, 400, { error: error instanceof Error && error.message === 'too large' ? 'Body too large.' : 'Send a JSON body.' });
        return;
      }
      const parsed = parseControl(body);
      if (typeof parsed === 'string') {
        send(response, 400, { error: parsed });
        return;
      }
      if (controller.current === null) {
        send(response, 503, { error: 'The e-zone tablet hasn\'t been read yet. Try again shortly.' });
        return;
      }
      log.debug(`Mac app: ${JSON.stringify(parsed)}`);
      applyControl(controller, parsed, sleepTimerMinutes);
      await controller.flush();
      send(response, 200, status());
      return;
    }
    send(response, 404, { error: 'Use GET /status or POST /control.' });
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function send(response: ServerResponse, statusCode: number, body: unknown): void {
  const json = `${JSON.stringify(body)}\n`;
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
  });
  response.end(json);
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}
