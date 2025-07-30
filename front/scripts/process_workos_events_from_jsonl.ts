import type { Event } from "@workos-inc/node";
import fs from "fs";
import readline from "readline";

import logger from "@app/logger/logger";
import { launchWorkOSEventsWorkflow } from "@app/temporal/workos_events_queue/client";

import { makeScript } from "./helpers";

async function processJsonlFile(filePath: string): Promise<Event[]> {
  const events: Event[] = [];
  const fileStream = fs.createReadStream(filePath);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber++;

    if (!line.trim()) {
      continue; // Skip empty lines
    }

    try {
      const event = JSON.parse(line) as Event;
      events.push(event);
    } catch (error) {
      logger.error({ lineNumber, line, error }, "Failed to parse JSON on line");
      throw new Error(`Failed to parse JSON on line ${lineNumber}: ${error}`);
    }
  }

  return events;
}

makeScript(
  {
    file: {
      alias: "f",
      describe: "Path to JSONL file containing WorkOS event payloads",
      type: "string" as const,
      demandOption: true,
    },
    batchSize: {
      alias: "b",
      describe: "Number of events to process in parallel (default: 1)",
      type: "number" as const,
      default: 1,
    },
  },
  async ({ file, batchSize, execute }, logger) => {
    logger.info(
      { file, execute, batchSize },
      "Starting WorkOS events processing"
    );

    try {
      // Read and parse the JSONL file
      const events = await processJsonlFile(file);
      logger.info({ eventCount: events.length }, "Loaded events from file");

      if (!execute) {
        logger.info("DRY RUN MODE - No workflows will be launched");
        for (const event of events) {
          logger.info(
            { eventId: event.id, eventType: event.event },
            "Would process event"
          );
        }
        return;
      }

      // Process events in batches
      const results = {
        successful: [] as Array<{ eventId: string; workflowId: string }>,
        failed: [] as Array<{ eventId: string; error: string }>,
      };

      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        logger.info(
          {
            batchStart: i + 1,
            batchEnd: Math.min(i + batchSize, events.length),
          },
          "Processing batch"
        );

        const batchPromises = batch.map(async (event) => {
          try {
            const result = await launchWorkOSEventsWorkflow({
              eventPayload: event,
            });

            if (result.isErr()) {
              logger.error(
                { eventId: event.id, error: result.error },
                "Failed to launch workflow"
              );
              results.failed.push({
                eventId: event.id,
                error: result.error.message,
              });
            } else {
              logger.info(
                { eventId: event.id, workflowId: result.value },
                "Successfully launched workflow"
              );
              results.successful.push({
                eventId: event.id,
                workflowId: result.value,
              });
            }
          } catch (error) {
            logger.error(
              { eventId: event.id, error },
              "Unexpected error launching workflow"
            );
            results.failed.push({
              eventId: event.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });

        await Promise.all(batchPromises);
      }

      // Log final results
      logger.info(
        {
          totalEvents: events.length,
          successful: results.successful.length,
          failed: results.failed.length,
        },
        "Processing completed"
      );

      if (results.failed.length > 0) {
        logger.error(
          { failedEvents: results.failed },
          "Some events failed to process"
        );
      }
    } catch (error) {
      logger.error({ error }, "Failed to process WorkOS events file");
      throw error;
    }
  }
);
