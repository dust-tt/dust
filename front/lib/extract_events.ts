import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { runAction } from "@app/lib/actions/server";
import { getInternalBuilderOwner } from "@app/lib/auth";
import {
  getRawExtractEventMarkersFromText,
  sanitizeRawExtractEventMarkers,
} from "@app/lib/extract_event_markers";
import { EventSchema, ExtractedEvent } from "@app/lib/models";
import logger from "@app/logger/logger";
import { WorkspaceType } from "@app/types/user";

/**
 * Gets the markers from the doc and calls _processExtractEvent for each of them
 */
export async function processExtractEvents(
  workspaceId: string,
  documentId: string,
  documentText: string
) {
  const owner = await getInternalBuilderOwner(workspaceId);
  const rawMarkers = getRawExtractEventMarkersFromText(documentText);
  const markers = sanitizeRawExtractEventMarkers(rawMarkers);

  await Promise.all(
    Object.keys(markers).map(async (marker) => {
      await _processExtractEvent(
        owner,
        marker,
        markers[marker],
        documentText,
        documentId
      );
    })
  );
}

/**
 * Gets the schema for the marker, runs the Dust app to extract properties, and saves the event(s)
 */
async function _processExtractEvent(
  owner: WorkspaceType,
  sanitizedMarker: string,
  markers: string[],
  documentText: string,
  documentId: string
) {
  const schema: EventSchema | null = await EventSchema.findOne({
    where: {
      workspaceId: owner.id,
      marker: sanitizedMarker,
      status: "active",
    },
  });
  if (!schema) {
    return null;
  }

  const inputsForApp = [
    {
      document_text: documentText,
      markers: markers,
      schema_properties: schema.properties,
    },
  ];

  const results = await _runExtractEventApp(owner, inputsForApp);

  if (results) {
    results.map(async (result: string) => {
      // @todo be smarter
      // check that this event is not already in the database
      // check the properties match what's expected (json is typed on model)
      // handle errors

      const properties = JSON.parse(result);

      logger.info(
        { properties, marker: schema.marker },
        "[Extract Event] Saving event"
      );
      await ExtractedEvent.create({
        documentId: documentId,
        properties: properties,
        eventSchemaId: schema.id,
      });
    });
  }
}

type ExtractEventAppResponseResults = {
  value: {
    results: { value: string[] }[][];
  };
};

/**
 * Runs the Extract event app and returns just only the results in which extracted events are found
 * @param owner
 * @param inputs
 */
async function _runExtractEventApp(
  owner: WorkspaceType,
  inputs: { document_text: string; markers: string[]; schema_properties: any }[]
) {
  const ACTION_NAME = "extract-events";
  const config = cloneBaseConfig(DustProdActionRegistry[ACTION_NAME]?.config);
  const response = await runAction(owner, ACTION_NAME, config, inputs);

  if (response.isErr()) {
    logger.error(
      { error: response.error },
      `api_error: ${JSON.stringify(response.error)}`
    );
    return null;
  }

  const successResponse = response as ExtractEventAppResponseResults;
  return successResponse.value.results[0][0].value;
}
