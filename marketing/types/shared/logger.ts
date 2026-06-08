// Structural interface compatible with pino Logger.
type LogFn = (obj: unknown, msg?: string, ...args: unknown[]) => void;

export interface LoggerInterface {
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}
