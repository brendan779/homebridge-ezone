// A stand-in e-zone tablet for development: serves getSystemData and setAircon on localhost.
//   node scripts/mock-ezone.ts [--port 2025] [--fixture test/fixtures/eight-zones-no-sensors.json] [--fast]
// --fast runs the off-countdown at one minute per second. Constant zones ignore "close", like the real tablet
// keeping them open. State lives in memory only.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '2025' },
    fixture: { type: 'string', default: 'test/fixtures/eight-zones-no-sensors.json' },
    fast: { type: 'boolean', default: false },
  },
});

type Json = Record<string, unknown>;
const data = JSON.parse(readFileSync(values.fixture, 'utf8')) as { aircons: Record<string, { info: Json; zones: Record<string, Json> }> };

/** The MyPlace app sends unquoted keys and values ({ac1:{info:{state:on}}}); accept that as well as real JSON. */
function lenientParse(text: string): Json {
  try {
    return JSON.parse(text) as Json;
  } catch {
    const quoted = text
      .replace(/([{,])\s*([A-Za-z_]\w*)\s*:/g, '$1"$2":')
      .replace(/:\s*([A-Za-z_]\w*)\s*([,}])/g, ':"$1"$2');
    return JSON.parse(quoted) as Json;
  }
}

function setAircon(change: Json): void {
  for (const [key, body] of Object.entries(change)) {
    const aircon = data.aircons[key];
    if (aircon === undefined) {
      throw new Error(`no aircon ${key}`);
    }
    const { info, zones } = body as { info?: Json; zones?: Record<string, Json> };
    if (info !== undefined) {
      Object.assign(aircon.info, info);
      if (info.state === 'off') {
        aircon.info.countDownToOff = 0;
      }
    }
    const constants = [aircon.info.constant1, aircon.info.constant2, aircon.info.constant3];
    for (const [id, zoneChange] of Object.entries(zones ?? {})) {
      const zone = aircon.zones[id];
      if (zone === undefined) {
        throw new Error(`no zone ${id}`);
      }
      if (zoneChange.state === 'close' && constants.includes(zone.number)) {
        console.log(`  ${id} is a constant zone: staying open`);
        delete zoneChange.state;
      }
      Object.assign(zone, zoneChange);
    }
  }
}

setInterval(() => {
  for (const aircon of Object.values(data.aircons)) {
    const remaining = aircon.info.countDownToOff as number;
    if (remaining > 0) {
      aircon.info.countDownToOff = remaining - 1;
      if (remaining === 1) {
        aircon.info.state = 'off';
        console.log('countdown finished: aircon off');
      }
    }
  }
}, values.fast ? 1_000 : 60_000);

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const reply = (status: number, body: unknown): void => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (url.pathname === '/getSystemData') {
    reply(200, data);
    return;
  }
  if (url.pathname === '/setAircon') {
    const json = url.searchParams.get('json') ?? '';
    console.log(`setAircon ${json}`);
    try {
      setAircon(lenientParse(json));
      reply(200, { ack: true, request: 'setAircon' });
    } catch (error) {
      reply(200, { ack: false, reason: String(error), request: 'setAircon' });
    }
    return;
  }
  reply(404, { error: 'not found' });
}).listen(Number(values.port), '127.0.0.1', () => {
  console.log(`mock e-zone on http://127.0.0.1:${values.port} (${values.fast ? 'fast' : 'real-time'} countdown)`);
});
