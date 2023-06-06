import logger from "@connectors/logger/logger";

export function assertNever(x: never): void {
  logger.warn({ x: x }, "should never happen");
}
