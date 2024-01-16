import type {
  EventSchemaType,
  ExtractEventAppResponseResults,
} from "@dust-tt/types";
import type { CoreAPITokenType } from "@dust-tt/types";
import { cloneBaseConfig, DustProdActionRegistry } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";

import { runAction } from "@app/lib/actions/server";
import type { Authenticator } from "@app/lib/auth";
import { findMarkersIndexes } from "@app/lib/extract_event_markers";
import { formatPropertiesForModel } from "@app/lib/extract_events_properties";
import logger from "@app/logger/logger";

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
 * Gets the maximum text content to process for the Dust app.
 * We define a maximum number of tokens that the Dust app can process.
 * It will return the text around the marker: first we expand the text before the marker, than after the marker.
 */
export async function _getMaxTextContentToProcess({
  fullText,
  marker,
}: {
  fullText: string;
  marker: string;
}): Promise<string> {
  const tokenized = await getTokenizedText(fullText);
  const tokens = tokenized.tokens;
  const nbTokens = tokens.length;
  const MAX_TOKENS = 6000;

  // If the text is small enough, just return it
  if (nbTokens < MAX_TOKENS) {
    return fullText;
  }

  // Otherwise we extract the tokens around the marker
  // and return the text corresponding to those tokens
  const extractTokensResult = extractMaxTokens({
    fullText,
    tokens,
    marker,
    maxTokens: MAX_TOKENS,
  });

  return extractTokensResult.map((t) => t[1]).join("");
}

/**
 * Extracts the maximum number of tokens around the marker.
 */
function extractMaxTokens({
  fullText,
  tokens,
  marker,
  maxTokens,
}: {
  fullText: string;
  tokens: CoreAPITokenType[];
  marker: string;
  maxTokens: number;
}): CoreAPITokenType[] {
  const { start, end } = findMarkersIndexes({ fullText, marker, tokens });

  if (start === -1 || end === -1) {
    return [];
  }

  // The number of tokens that the marker takes up
  const markerTokens = end - start + 1;

  // The number of remaining tokens that can be included around the marker
  const remainingTokens = maxTokens - markerTokens;

  // Initialize the slicing start and end points around the marker
  let startSlice = start;
  let endSlice = end;

  // Try to add tokens before the marker first
  if (remainingTokens > 0) {
    startSlice = Math.max(0, start - remainingTokens);

    // Calculate any remaining tokens that can be used after the marker
    const remainingAfter = remainingTokens - (start - startSlice);

    // If there are any tokens left, add them after the marker
    if (remainingAfter > 0) {
      endSlice = Math.min(tokens.length - 1, end + remainingAfter);
    }
  }

  return tokens.slice(startSlice, endSlice + 1);
}

/**
 * Calls Core API to get the tokens and associated strings for a given text.
 * Ex: "Un petit Soupinou des bois [[idea:2]]" will return:
 * {
 *   tokens: [
      [ 1844, 'Un' ],
      [ 46110, ' petit' ],
      [ 9424, ' Sou' ],
      [ 13576, 'pin' ],
      [ 283, 'ou' ],
      [ 951, ' des' ],
      [ 66304, ' bois' ],
      [ 4416, ' [[' ],
      [ 42877, 'idea' ],
      [ 25, ':' ],
      [ 17, '2' ],
      [ 5163, ']]' ]
    ],
 * }
 */

export async function getTokenizedText(
  text: string
): Promise<{ tokens: CoreAPITokenType[] }> {
  const coreAPI = new CoreAPI(logger);
  const tokenizeResponse = await coreAPI.tokenize({
    text: text,
    providerId: "openai",
    modelId: "gpt-4",
  });
  if (tokenizeResponse.isErr()) {
    {
      tokenizeResponse.error;
    }
    logger.error(
      "Could not get number of tokens for document, trying with full doc."
    );
    return { tokens: [] };
  }

  return tokenizeResponse.value;
}
