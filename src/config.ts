export interface PluginConfig {
  /** e-zone tablet address (IP or hostname). */
  host: string;
  port: number;
  /** Which aircon on the tablet; e-zone systems have one, `ac1`. */
  aircon: string;
  pollSeconds: number;
  sleepTimerMinutes: number;
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

  return {
    config: {
      host,
      port: integer('port', DEFAULTS.port, 1, 65535),
      aircon,
      pollSeconds: integer('pollSeconds', DEFAULTS.pollSeconds, 3, 300),
      sleepTimerMinutes: integer('sleepTimerMinutes', DEFAULTS.sleepTimerMinutes, 10, 720),
    },
    warnings,
    errors,
  };
}
