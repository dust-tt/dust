import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { runAction } from "@app/lib/actions/server";
import { Authenticator } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { formatPropertiesForModel } from "@app/lib/extract_events_properties";
import logger from "@app/logger/logger";
import { EventSchemaType } from "@app/types/extract";

const EXTRACT_MAX_NUMBER_TOKENS_TO_PROCESS = 6000;

export type ExtractEventAppResponseResults = {
  value: {
    results: { value: string }[][];
  };
};

/**
 * Runs the Extract event app and returns just only the results in which extracted events are found
 * @param auth
 * @param inputs
 */
export async function _runExtractEventApp({
  auth,
  content,
  marker,
  schema,
}: {
  auth: Authenticator;
  content: string;
  marker: string;
  schema: EventSchemaType;
}): Promise<string> {
  const inputs = [
    {
      content: content,
      marker: marker,
      properties_to_extract: formatPropertiesForModel(schema.properties),
    },
  ];

  const ACTION_NAME = "extract-events";
  const config = cloneBaseConfig(DustProdActionRegistry[ACTION_NAME]?.config);
  const response = await runAction(auth, ACTION_NAME, config, inputs);

  if (response.isErr()) {
    logger.error(
      { error: response.error },
      `api_error: ${JSON.stringify(response.error)}`
    );
    return "";
  }

  const successResponse = response as ExtractEventAppResponseResults;
  const successResponseValue = successResponse.value.results[0][0].value;

  logger.info(
    { value: successResponseValue },
    "[Extract Event] Extract event app ran successfully."
  );

  return successResponseValue;
}

/**
 * Return the content to process by the Extract Event app.
 * If the document is too big, we send only part of it to the Dust App.
 * @param fullDocumentText
 * @param marker
 */
export async function _getMaxTextContentToProcess({
  fullDocumentText,
  marker,
}: {
  fullDocumentText: string;
  marker: string;
}): Promise<string> {
  const tokensInDocumentText = await CoreAPI.tokenize({
    text: fullDocumentText,
    modelId: "text-embedding-ada-002",
    providerId: "openai",
  });
  if (tokensInDocumentText.isErr()) {
    {
      tokensInDocumentText.error;
    }
    logger.error(
      "Could not get number of tokens for document, trying with full doc."
    );
    return fullDocumentText;
  }

  const numberOfTokens = tokensInDocumentText.value.tokens.length;
  let documentTextToProcess: string;

  if (numberOfTokens > EXTRACT_MAX_NUMBER_TOKENS_TO_PROCESS) {
    // Document is too big, we need to send only part of it to the Dust App.
    const fullDocLength = fullDocumentText.length;
    const markerIndex = fullDocumentText.indexOf(marker);
    const markerLength = marker.length;

    // We can go half the max number of tokens on each side of the marker.
    // We multiply by 4 because we assume 1 token is approximately 4 characters
    const maxLength = (EXTRACT_MAX_NUMBER_TOKENS_TO_PROCESS / 2) * 4;

    const start = Math.max(0, markerIndex - maxLength);
    const end = Math.min(fullDocLength, markerIndex + markerLength + maxLength);
    documentTextToProcess = fullDocumentText.substring(start, end);
  } else {
    // Document is small enough, we send the whole text.
    documentTextToProcess = fullDocumentText;
  }

  return documentTextToProcess;
}
