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
 * Gets the maximum text content to process for the Dust app.
 * We don't go up to the maximum number of tokens because the Dust app
 */
export async function _getMaxTextContentToProcess({
  fullText,
  marker,
}: {
  fullText: string;
  marker: string;
}): Promise<string> {
  const MAX_TOKENS = 10;
  const tokenized = await getTokenizedText(fullText);
  const tokens = tokenized.tokens;
  const strings = tokenized.strings;
  const nbTokens = tokens.length;

  // If the text is small enough, just return it
  if (nbTokens < MAX_TOKENS) {
    return fullText;
  }

  // Otherwise we extract the tokens around the marker
  // and return the text corresponding to those tokens
  const extractTokensResult = extractTokens({
    fullText,
    tokens,
    strings,
    marker,
    maxTokens: MAX_TOKENS,
  });

  return extractTokensResult.strings.join("");
}

/**
 * Gets the indexes of the tokens around the marker
 */
function findMarkersIndexes({
  fullText,
  marker,
  strings,
}: {
  fullText: string;
  marker: string;
  strings: string[];
}): { start: number; end: number } {
  const markerIndex = fullText.indexOf(marker);
  if (markerIndex === -1) return { start: -1, end: -1 };

  let charCount = 0;
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < strings.length; i++) {
    const str = strings[i];
    charCount += str.length;

    if (startIndex === -1 && charCount > markerIndex) {
      startIndex = i;
    }

    if (charCount >= markerIndex + marker.length) {
      endIndex = i;
      break;
    }
  }

  return { start: startIndex, end: endIndex };
}

/**
 * Extracts the tokens around the marker
 */
function extractTokens({
  fullText,
  tokens,
  strings,
  marker,
  maxTokens,
}: {
  fullText: string;
  tokens: number[];
  strings: string[];
  marker: string;
  maxTokens: number;
}): { tokens: number[]; strings: string[] } {
  const { start, end } = findMarkersIndexes({ fullText, marker, strings });

  if (start === -1 || end === -1) {
    return { tokens: [], strings: [] };
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

  return {
    tokens: tokens.slice(startSlice, endSlice + 1),
    strings: strings.slice(startSlice, endSlice + 1),
  };
}

/**
 * Calling Core API to get the number of tokens in a text.
 */
export async function getTokenizedText(
  text: string
): Promise<{ tokens: number[]; strings: string[] }> {
  console.log("computeNbTokens4");
  const tokenizeResponse = await CoreAPI.tokenize({
    text: text,
    modelId: "text-embedding-ada-002",
    providerId: "openai",
  });
  if (tokenizeResponse.isErr()) {
    {
      tokenizeResponse.error;
    }
    logger.error(
      "Could not get number of tokens for document, trying with full doc."
    );
    return { tokens: [], strings: [] };
  }

  const tokens = tokenizeResponse.value.tokens;
  const strings = tokenizeResponse.value.strings;

  return {
    tokens: tokens,
    strings: strings,
  };
}
