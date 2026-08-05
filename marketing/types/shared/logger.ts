// Structural interface compatible with our pino Logger, whose log methods reject a `status`
// that Datadog would misread as the log severity.
type LogFn = (
  obj: Record<string, unknown>,
  msg?: string,
  ...args: unknown[]
) => void;

export interface LoggerInterface {
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}
