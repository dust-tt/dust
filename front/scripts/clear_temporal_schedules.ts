import { makeScript } from "./helpers";

makeScript(
  {
    namespace: {
      alias: "n",
      describe: "Temporal namespace to clear schedules from",
      type: "string",
      choices: ["agent", "front", "connectors"],
      default: "agent",
    },
  },
  async ({ execute, namespace }, scriptLogger) => {
    scriptLogger.info(
      { namespace, execute },
      `Starting to clear all schedules in Temporal namespace: ${namespace}`
    );

    if (!execute) {
      scriptLogger.warn(
        "This is a dry run. Use --execute to actually clear the schedules."
      );
    }

    // Get the appropriate Temporal client based on namespace
    let client;
    switch (namespace) {
      case "agent":
        const { getTemporalClientForAgentNamespace } = await import(
          "@app/lib/temporal"
        );
        client = await getTemporalClientForAgentNamespace();
        break;
      case "front":
        const { getTemporalClientForFrontNamespace } = await import(
          "@app/lib/temporal"
        );
        client = await getTemporalClientForFrontNamespace();
        break;
      case "connectors":
        const { getTemporalClientForConnectorsNamespace } = await import(
          "@app/lib/temporal"
        );
        client = await getTemporalClientForConnectorsNamespace();
        break;
      default:
        throw new Error(`Unsupported namespace: ${namespace}`);
    }

    try {
      // List all schedules
      scriptLogger.info("Fetching all schedules...");
      const schedulesIterable = client.schedule.list();

      // Convert AsyncIterable to array
      const schedules = [];
      for await (const schedule of schedulesIterable) {
        schedules.push(schedule);
      }

      if (schedules.length === 0) {
        scriptLogger.info("No schedules found to clear.");
        return;
      }

      scriptLogger.info(`Found ${schedules.length} schedules to clear.`);

      let deletedCount = 0;
      let errorCount = 0;

      // Iterate through and delete each schedule
      for (const schedule of schedules) {
        const scheduleId = schedule.scheduleId;

        try {
          scriptLogger.info(
            { scheduleId },
            `Processing schedule: ${scheduleId}`
          );

          if (execute) {
            const handle = client.schedule.getHandle(scheduleId);
            await handle.delete();
            scriptLogger.info(
              { scheduleId },
              `✅ Deleted schedule: ${scheduleId}`
            );
            deletedCount++;
          } else {
            scriptLogger.info(
              { scheduleId },
              `🔍 Would delete schedule: ${scheduleId} (dry run)`
            );
          }
        } catch (error) {
          scriptLogger.error(
            { scheduleId, error },
            `❌ Failed to delete schedule: ${scheduleId}`
          );
          errorCount++;
        }
      }

      if (execute) {
        scriptLogger.info(
          { deletedCount, errorCount, totalSchedules: schedules.length },
          `Completed clearing schedules. Deleted: ${deletedCount}, Errors: ${errorCount}`
        );
      } else {
        scriptLogger.info(
          { totalSchedules: schedules.length },
          `Dry run completed. Found ${schedules.length} schedules that would be deleted.`
        );
      }
    } catch (error) {
      scriptLogger.error({ error }, "Failed to list or clear schedules");
      throw error;
    }
  }
);
