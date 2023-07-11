import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { runAction } from "@app/lib/actions/server";
import { Authenticator } from "@app/lib/auth";
import {
  getRawExtractEventMarkersFromText,
  sanitizeRawExtractEventMarkers,
} from "@app/lib/extract_event_markers";
import { DataSource, EventSchema, ExtractedEvent } from "@app/lib/models";
import logger from "@app/logger/logger";
import { getDatasource } from "@app/post_upsert_hooks/hooks/lib/data_source_helpers";

/**
 * Gets the markers from the doc and calls _processExtractEvent for each of them
 */
export async function processExtractEvents(data: {
  workspaceId: string;
  dataSourceName: string;
  documentId: string;
  documentText: string;
}) {
  const { workspaceId, documentId, dataSourceName, documentText } = data;
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
  } else {
    logger.info(`[Extract event] Processing datasource ${dataSourceName}.`);
  }

  const rawMarkers = getRawExtractEventMarkersFromText(documentText);
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
}) {
  const {
    auth,
    dataSource,
    sanitizedMarker,
    markers,
    documentId,
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

  const inputsForApp = [
    {
      document_text: documentText,
      markers: markers,
      schema_properties: schema.properties,
    },
  ];

  const results = await _runExtractEventApp(auth, inputsForApp);
  results.map(async (result: string) => {
    // @todo be smarter
    // check that this event is not already in the database
    // check the properties match what's expected (json is typed on model)
    // handle errors
    const properties = JSON.parse(result);

    logger.info(
      { properties, marker: schema.marker },
      "[Extract Event] Saving event."
    );
    await ExtractedEvent.create({
      documentId: documentId,
      properties: properties,
      eventSchemaId: schema.id,
      dataSourceId: dataSource.id,
    });
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
