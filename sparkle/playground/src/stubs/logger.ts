// Browser stub for `@app/logger/logger`. The real one pulls in pino and reads
// `process.env`, neither of which exist in the playground; stories only reach
// it transitively (via `@app/lib/utils`), never to actually log.
const noop = () => {};

const logger = {
  child: () => logger,
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  silent: noop,
  level: "silent",
};

export const DATADOG_LOG_STATUSES = [] as const;

export const auditLog = noop;

export default logger;
