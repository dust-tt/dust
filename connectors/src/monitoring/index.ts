export class MonitoringError extends Error {}
import StatsDClient from "hot-shots";

import mainlogger from "@connectors/logger/logger";
const logger = mainlogger.child({ module: "temporal-monitoring" });

type asyncF<T> = (...args: unknown[]) => Promise<T>;

export const statsDClient = new StatsDClient({});

export function withMonitoring<T>(fn: asyncF<T>): asyncF<T> {
  return async (...args: unknown[]): Promise<T> => {
    let result: T | undefined = undefined;

    try {
      const startTime = new Date();
      logger.info({ activity: fn.name }, `Activity started`);

      const tags = [`activity:${fn.name}`];
      statsDClient.increment("activities.count", 1, tags);

      result = await fn(...args);
      const endTime = new Date();
      const elapsedMs = endTime.getTime() - startTime.getTime();
      statsDClient.histogram(`activity.duration`, elapsedMs, tags);
      logger.info(
        { activity: fn.name, elapsedMs: elapsedMs },
        `Activity ended successfully`
      );
      return result;
    } catch (e) {
      let tags = [`activity:${fn.name}`];
      if (e instanceof MonitoringError) {
        tags = tags.concat([`known_error:true`]);
      } else {
        tags = tags.concat([`activity:${fn.name}`, `known_error:false`]);
      }
      statsDClient.increment("activities_errors.count", 1, tags);
      logger.error({ activity: fn.name }, `activity errored`);

      throw e;
    }
  };
}
