export interface PluginConfig {
  /** e-zone tablet address (IP or hostname). */
  host: string;
  port: number;
  /** Which aircon on the tablet; e-zone systems have one, `ac1`. */
  aircon: string;
  pollSeconds: number;
  sleepTimerMinutes: number;
  /** Port for the Mac app's status/control address, or null when that's off. */
  macAppPort: number | null;
}

export interface ParsedConfig {
  config: PluginConfig;
  warnings: string[];
  errors: string[];
}

export const DEFAULTS = {
  port: 2025,
  aircon: 'ac1',
  pollSeconds: 10,
  sleepTimerMinutes: 120,
  macAppPort: 8583,
} as const;

/**
 * Validates the raw platform block from config.json. Errors leave the plugin idle; warnings fall back to defaults.
 */
export function parseConfig(raw: Record<string, unknown>): ParsedConfig {
  const warnings: string[] = [];
  const errors: string[] = [];

  const host = typeof raw.host === 'string' ? raw.host.trim() : '';
  if (host === '') {
    errors.push('Set "host" to the e-zone tablet\'s IP address.');
  }

  const integer = (key: string, fallback: number, min: number, max: number): number => {
    const value = raw[key];
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      warnings.push(`"${key}" must be a whole number from ${min} to ${max}; using ${fallback}.`);
      return fallback;
    }
    return value;
  };

  let aircon: string = DEFAULTS.aircon;
  if (raw.aircon !== undefined) {
    if (typeof raw.aircon === 'string' && /^ac\d$/.test(raw.aircon)) {
      aircon = raw.aircon;
    } else {
      warnings.push(`"aircon" must look like "ac1"; using ${DEFAULTS.aircon}.`);
    }
  }

  let macAppPort: number | null = null;
  const macApp = raw.macApp;
  if (macApp !== undefined && macApp !== null) {
    if (typeof macApp !== 'object' || Array.isArray(macApp)) {
      warnings.push('"macApp" must be an object like { "enabled": true }; Mac app access is off.');
    } else {
      const block = macApp as Record<string, unknown>;
      if (block.enabled === true) {
        const port = block.port ?? DEFAULTS.macAppPort;
        if (typeof port === 'number' && Number.isInteger(port) && port >= 1024 && port <= 65535) {
          macAppPort = port;
        } else {
          warnings.push(`"macApp.port" must be a whole number from 1024 to 65535; using ${DEFAULTS.macAppPort}.`);
          macAppPort = DEFAULTS.macAppPort;
        }
      }
    }
  }

  return {
    config: {
      host,
      port: integer('port', DEFAULTS.port, 1, 65535),
      aircon,
      pollSeconds: integer('pollSeconds', DEFAULTS.pollSeconds, 3, 300),
      sleepTimerMinutes: integer('sleepTimerMinutes', DEFAULTS.sleepTimerMinutes, 10, 720),
      macAppPort,
    },
    warnings,
    errors,
  };
}
