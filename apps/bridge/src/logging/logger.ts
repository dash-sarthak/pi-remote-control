import { pino, type Logger as PinoLogger } from 'pino';

/** Structured logger used everywhere in the bridge. Each call writes one JSON object per line. */
export type Logger = PinoLogger;

/** Log levels accepted by {@link createLogger}, from most to least verbose. */
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

/** One of {@link LOG_LEVELS}. */
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Options for {@link createLogger}. */
export interface LoggerOptions {
  /** Name of the subsystem emitting the logs, written as the `component` field. */
  readonly component: string;
  /** Minimum level written. Defaults to `PIRC_LOG_LEVEL`, then `info`. */
  readonly level?: LogLevel;
  /** Receives each serialized line without its trailing LF. Defaults to synchronous writes to stderr. */
  readonly write?: (line: string) => void;
}

/**
 * Returns true when `value` names a supported log level.
 *
 * @param value - Untrusted input, typically an environment variable.
 */
export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value);
}

/**
 * Creates the bridge's structured logger.
 *
 * Every line is a JSON object with an ISO-8601 `time`, a textual `level`, the
 * `component`, and `msg`, plus any fields passed to the log call. Errors passed
 * as `err` are serialized with `type`, `message`, and `stack`. Logs go to
 * stderr so stdout stays free for program output.
 *
 * @throws {Error} When `PIRC_LOG_LEVEL` is set to an unsupported level.
 */
export function createLogger(options: LoggerOptions): Logger {
  const envLevel = process.env.PIRC_LOG_LEVEL;
  if (options.level === undefined && envLevel !== undefined && !isLogLevel(envLevel)) {
    throw new Error(`PIRC_LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}; got "${envLevel}"`);
  }
  const level: LogLevel = options.level ?? (isLogLevel(envLevel) ? envLevel : 'info');
  const write = options.write;
  const destination =
    write === undefined
      ? pino.destination({ fd: 2, sync: true })
      : {
          write: (chunk: string) => {
            write(chunk.endsWith('\n') ? chunk.slice(0, -1) : chunk);
          },
        };
  return pino(
    {
      level,
      base: { component: options.component },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
    },
    destination,
  );
}
