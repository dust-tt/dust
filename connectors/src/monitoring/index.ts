export class MonitoringError extends Error {}
import StatsDClient from "hot-shots";

import mainlogger from "@connectors/logger/logger";
const logger = mainlogger.child({ module: "temporal-monitoring" });

type asyncF<T> = (...args: any[]) => Promise<T>;

export const statsDClient = new StatsDClient({});

export function withMonitoring<T>(fn: asyncF<T>): asyncF<T> {
  return async (...args: any[]): Promise<T> => {
    const startTime = new Date();
    let result: T | undefined = undefined;

    try {
      logger.info({ activity: fn.name }, `Activity started`);
      const endTime = new Date();
      const elapsedMs = endTime.getTime() - startTime.getTime();
      const tags = [`activity:${fn.name}`];
      statsDClient.increment("activities.count", 1, tags);

      result = await fn(...args);
      statsDClient.histogram(`activity.duration`, elapsedMs, tags);
      logger.info(
        { activity: fn.name, elapsedMs: elapsedMs },
        `activity ended`
      );
      return result;
    } catch (e) {
      let tags = [`activity:${fn.name}`];
      if (e instanceof MonitoringError) {
        tags = tags.concat([`known_error:true`, `error_type:${typeof e}`]);

        // got known error
      } else {
        tags = tags.concat([
          `activity:${fn.name}`,
          `known_error:false`,
          `error_type:${typeof e}`,
        ]);
        // got unknown error
      }
      statsDClient.increment("activities_errors.count", 1, tags);
      logger.error({ activity: fn.name }, `activity errored`);

      throw e;
    }
  };
}
