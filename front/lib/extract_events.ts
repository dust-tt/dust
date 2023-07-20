import { Op } from "sequelize";

import {
  DocumentsPostProcessHookFilterParams,
  DocumentsPostProcessHookOnUpsertParams,
} from "@app/documents_post_process_hooks/hooks";
import { getDatasource } from "@app/documents_post_process_hooks/hooks/lib/data_source_helpers";
import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { runAction } from "@app/lib/actions/server";
import { Authenticator } from "@app/lib/auth";
import {
  getExtractEventMarkersToProcess,
  getRawExtractEventMarkersFromText,
  hasExtractEventMarker,
  sanitizeRawExtractEventMarkers,
} from "@app/lib/extract_event_markers";
import { DataSource, EventSchema, ExtractedEvent } from "@app/lib/models";
import logger from "@app/logger/logger";
import { logOnSlack } from "@app/logger/slack_debug_logger";

export async function shouldProcessExtractEvents(
  params: DocumentsPostProcessHookFilterParams
) {
  if (params.verb !== "upsert") {
    logger.info("extract_events post process hook should only run for upsert.");
    return false;
  }

  const { workspaceId, dataSourceName, documentId, documentText } = params;

  const localLogger = logger.child({ workspaceId, dataSourceName, documentId });
  const hasMarker = hasExtractEventMarker(documentText);
  if (!hasMarker) {
    localLogger.info("[Extract event] Doc contains no marker.");
    return false;
  }

  const rawMarkers = getRawExtractEventMarkersFromText(documentText);
  const markers = sanitizeRawExtractEventMarkers(rawMarkers);

  const activeSchema: EventSchema | null = await EventSchema.findOne({
    where: {
      marker: {
        [Op.in]: Object.keys(markers),
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
  workspaceId,
  dataSourceName,
  documentId,
  documentSourceUrl,
  documentText,
}: DocumentsPostProcessHookOnUpsertParams) {
  const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);
  if (!auth.workspace()) {
    logger.error(
      `Could not get internal auth for workspace ${workspaceId} to process extract events.`
    );
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
  const rawMarkers = await getExtractEventMarkersToProcess({
    documentId,
    dataSourceId: dataSource.id,
    documentText,
  });
  const markers = sanitizeRawExtractEventMarkers(rawMarkers);

  await Promise.all(
    Object.keys(markers).map((marker) => {
      return _processExtractEvent({
        auth: auth,
        dataSource: dataSource,
        sanitizedMarker: marker,
        markers: markers[marker],
        documentText: documentText,
        documentId: documentId,
        documentSourceUrl: documentSourceUrl,
      });
    })
  );
}

/**
 * Gets the schema for the marker, runs the Dust app to extract properties, and saves the event(s)
 */
async function _processExtractEvent(data: {
  auth: Authenticator;
  dataSource: DataSource;
  sanitizedMarker: string;
  markers: string[];
  documentText: string;
  documentId: string;
  documentSourceUrl?: string;
}) {
  const {
    auth,
    dataSource,
    sanitizedMarker,
    markers,
    documentId,
    documentSourceUrl,
    documentText,
  } = data;

  const schema: EventSchema | null = await EventSchema.findOne({
    where: {
      workspaceId: auth.workspace()?.id,
      marker: sanitizedMarker,
      status: "active",
    },
  });

  if (!schema) {
    return;
  }

  const propertiesAsObject = {} as {
    [key: string]: { type: string; description: string };
  };
  schema.properties.map((prop) => {
    propertiesAsObject[prop.name] = {
      type: prop.type,
      description: prop.description,
    };
  });

  const inputsForApp = [
    {
      document_text: documentText,
      markers: markers,
      schema_properties: propertiesAsObject,
    },
  ];

  const results = await _runExtractEventApp(auth, inputsForApp);
  results.map(async (result: string) => {
    const properties = JSON.parse(result);
    if (!properties.marker) {
      logger.error(
        { properties, marker: schema.marker, documentSourceUrl, documentId },
        "Extract event app did not return a marker. Skipping."
      );
      return;
    }

    const event = await ExtractedEvent.create({
      documentId: documentId,
      properties: properties,
      eventSchemaId: schema.id,
      dataSourceId: dataSource.id,
      marker: properties.marker,
    });

    // Temp: we log on slack events that are extracted from the Dust workspace
    if (schema.debug === true) {
      await _logDebugEventOnSlack({ event, schema, documentSourceUrl });
    }
    logger.info(
      { properties, marker: schema.marker, documentSourceUrl, documentId },
      "[Extract Event] Event saved and logged."
    );
  });
}

type ExtractEventAppResponseResults = {
  value: {
    results: { value: string[] }[][];
  };
};

/**
 * Runs the Extract event app and returns just only the results in which extracted events are found
 * @param auth
 * @param inputs
 */
async function _runExtractEventApp(
  auth: Authenticator,
  inputs: { document_text: string; markers: string[]; schema_properties: any }[]
): Promise<string[]> {
  const ACTION_NAME = "extract-events";
  const config = cloneBaseConfig(DustProdActionRegistry[ACTION_NAME]?.config);
  const response = await runAction(auth, ACTION_NAME, config, inputs);

  if (response.isErr()) {
    logger.error(
      { error: response.error },
      `api_error: ${JSON.stringify(response.error)}`
    );
    return [];
  }

  const successResponse = response as ExtractEventAppResponseResults;
  return successResponse.value.results[0][0].value;
}

/**
 * Logs the event on Dust's Slack if the schema is in debug mode
 * Temporary, until we have a better way to extract events from the table.
 * @param event
 * @param schema
 * @param documentSourceUrl
 */
export async function _logDebugEventOnSlack({
  event,
  schema,
  documentSourceUrl,
}: {
  event: ExtractedEvent;
  schema: EventSchema;
  documentSourceUrl?: string;
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
        text: "Wanna check the source document?",
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: "Open document",
          emoji: true,
        },
        url: documentSourceUrl || "", // @todo daph remove fallback not needed after all jobs are processed.
      },
    },
  ];

  await logOnSlack({ blocks: formattedBlocks });
}
