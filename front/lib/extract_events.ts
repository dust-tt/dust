import { Op } from "sequelize";

import {
  DocumentsPostProcessHookFilterParams,
  DocumentsPostProcessHookOnUpsertParams,
} from "@app/documents_post_process_hooks/hooks";
import { getDatasource } from "@app/documents_post_process_hooks/hooks/lib/data_source_helpers";
import { Authenticator } from "@app/lib/auth";
import {
  _getMaxTextContentToProcess,
  _runExtractEventApp,
} from "@app/lib/extract_event_app";
import {
  getExtractEventMarkersToProcess,
  getRawExtractEventMarkersFromText,
  getUniqueMarkersWithoutSuffix,
  hasExtractEventMarker,
} from "@app/lib/extract_event_markers";
import { EventSchema, ExtractedEvent } from "@app/lib/models";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { logOnSlack } from "@app/logger/slack_debug_logger";

const { URL } = process.env;

export async function shouldProcessExtractEvents(
  params: DocumentsPostProcessHookFilterParams
) {
  if (params.verb !== "upsert") {
    logger.info("extract_events post process hook should only run for upsert.");
    return false;
  }

  const { auth, dataSourceName, documentId, documentText } = params;
  const workspaceId = auth.workspace()?.sId;
  if (!workspaceId) {
    logger.error(
      "Could not get workspace id to process extract events. Skipping."
    );
    return false;
  }

  const localLogger = logger.child({ workspaceId, dataSourceName, documentId });
  const hasMarker = hasExtractEventMarker(documentText);
  if (!hasMarker) {
    localLogger.info("[Extract event] Doc contains no marker.");
    return false;
  }

  const markersWithSuffix = getRawExtractEventMarkersFromText(documentText);
  const markersWithoutSuffix = getUniqueMarkersWithoutSuffix(markersWithSuffix);

  const activeSchema: EventSchema | null = await EventSchema.findOne({
    where: {
      marker: {
        [Op.in]: markersWithoutSuffix,
      },
      status: "active",
    },
  });
  localLogger.info(
    `[Extract event] Doc contains marker for active schemas: ${
      activeSchema ? `yes (${activeSchema.marker})` : "no"
    }`
  );
  return !!activeSchema;
}

/**
 * Gets the markers from the doc and calls _processExtractEvent for each of them
 */
export async function processExtractEvents({
  auth,
  dataSourceName,
  documentId,
  documentSourceUrl,
  documentText,
}: DocumentsPostProcessHookOnUpsertParams) {
  const workspaceId = auth.workspace()?.sId;
  if (!workspaceId) {
    logger.error(`Could not get workspace to process extract events.`);
    return;
  }

  const dataSource = await getDatasource(dataSourceName, workspaceId);
  if (!dataSource) {
    logger.error(
      `[Extract event] Could not get datasource ${dataSourceName}. Skipping.`
    );
    return;
  }

  // Getting the markers from the doc and keeping only those not already in the DB
  const markersToProcess = await getExtractEventMarkersToProcess({
    documentId,
    dataSourceName: dataSourceName,
    documentText,
  });

  await Promise.all(
    markersToProcess.map((marker) => {
      return _processExtractEventsForMarker({
        auth: auth,
        dataSourceName: dataSourceName,
        marker: marker,
        documentText: documentText,
        documentId: documentId,
        documentSourceUrl: documentSourceUrl || null,
      });
    })
  );
}

/**
 * 1/ Gets the schema for the marker,
 * 2/ Checks that the document is not too big for the Dust app,
 * 3/ Runs the Dust app to extract schema properties from the document,
 * 4/ Saves the event(s) in the DB.
 */
async function _processExtractEventsForMarker({
  auth,
  dataSourceName,
  marker,
  documentId,
  documentSourceUrl,
  documentText,
}: {
  auth: Authenticator;
  dataSourceName: string;
  marker: string;
  documentText: string;
  documentId: string;
  documentSourceUrl: string | null;
}) {
  // 1/ Get the schema for the marker
  const schema: EventSchema | null = await EventSchema.findOne({
    where: {
      workspaceId: auth.workspace()?.id,
      marker: marker.split(":")[0],
      status: "active",
    },
  });

  if (!schema) {
    return;
  }

  // 2/ Check that the document is not to big for the Dust App.
  const contentToProcess = await _getMaxTextContentToProcess({
    fullDocumentText: documentText,
    marker: marker,
  });

  // 3/ Run the Dust app to extract properties
  const result = await _runExtractEventApp({
    auth,
    content: contentToProcess,
    marker: marker,
    schema,
  });

  if (result.length === 0) {
    logger.info(
      { marker: schema.marker, documentSourceUrl, documentId },
      "[Extract Event] No event extracted."
    );
    return;
  }

  // 4/ Save the event(s) in the DB
  const properties = JSON.parse(result);
  if (!properties.marker) {
    logger.error(
      { properties, marker: schema.marker, documentSourceUrl, documentId },
      "Extract event app did not return a marker. Skipping."
    );
    return;
  }

  const event = await ExtractedEvent.create({
    sId: generateModelSId(),
    documentId: documentId,
    properties: properties,
    status: "pending",
    eventSchemaId: schema.id,
    dataSourceName: dataSourceName,
    documentSourceUrl: documentSourceUrl || null,
    marker: properties.marker,
  });

  // 5/ Temp: we log on slack events that are extracted from the Dust workspace
  const wId = auth.workspace()?.sId;
  if (schema.debug === true && wId) {
    await _logDebugEventOnSlack({
      wId,
      event,
      schema,
      documentSourceUrl,
    });
  }
  logger.info(
    { properties, marker: schema.marker, documentSourceUrl, documentId },
    "[Extract Event] Event saved and logged."
  );
}

/**
 * Logs the event on Dust's Slack if the schema is in debug mode
 * Temporary, until we have a better way to extract events from the table.
 * @param event
 * @param schema
 * @param documentSourceUrl
 */
export async function _logDebugEventOnSlack({
  wId,
  event,
  schema,
  documentSourceUrl,
}: {
  wId: string;
  event: ExtractedEvent;
  schema: EventSchema;
  documentSourceUrl: string | null;
}): Promise<void> {
  if (event.eventSchemaId !== schema.id) {
    logger.error(
      { event, schema },
      "[Extract Event] Event schema does not match event."
    );
    return;
  }
  if (schema.debug !== true) {
    return;
  }

  const formattedBlocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `New event extracted for marker [[${schema.marker}]]`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "```" + JSON.stringify(event.properties, null, 2) + "```",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Link to source document",
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: "Document",
          emoji: true,
        },
        url: documentSourceUrl || "",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Link to Extracted Event",
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: "Event",
          emoji: true,
        },
        url: URL + `/w/${wId}/u/extract/events/${event.sId}/edit`,
      },
    },
  ];

  await logOnSlack({ blocks: formattedBlocks });
}
