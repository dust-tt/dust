import logger from "@app/logger/logger";
import { launchWorkOSEventsWorkflow } from "@app/temporal/workos_events_queue/client";
import type { Event } from "@workos-inc/node";
import fs from "fs";
import readline from "readline";

import { makeScript } from "./helpers";

function snakeToCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(snakeToCamelCase);
  } else if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
        snakeToCamelCase(value),
      ])
    );
  }
  return obj;
}

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
      const event = snakeToCamelCase(JSON.parse(line)) as Event;
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
  },
  async ({ file, execute }, logger) => {
    logger.info({ file, execute }, "Starting WorkOS events processing");

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

      // Process events
      for (const event of events) {
        const result = await launchWorkOSEventsWorkflow({
          eventPayload: event,
        });

        if (result.isErr()) {
          logger.error(
            { eventId: event.id, error: result.error },
            "Failed to launch workflow"
          );
          return;
        } else {
          logger.info(
            { eventId: event.id, workflowId: result.value },
            "Successfully launched workflow"
          );
        }
      }

      // Log final results
      logger.info(
        {
          totalEvents: events.length,
        },
        "Processing completed"
      );
    } catch (error) {
      logger.error({ error }, "Failed to process WorkOS events file");
      throw error;
    }
  }
);
