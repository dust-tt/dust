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
 * Return the content to process by the Extract Event app.
 * If the document is too big, we send only part of it to the Dust App.
 * We first expand to get content before the marker, and then after it.
 * @param fullText
 * @param marker
 */
export async function _getMaxTextContentToProcessV0({
  fullText,
  marker,
}: {
  fullText: string;
  marker: string;
}): Promise<string> {
  const MAX_TOKENS = 6000;
  const CHUNK_SIZE = 250;

  // If the text is small enough, just return it
  const totalTokens = await computeNbTokens(fullText);
  if (totalTokens < MAX_TOKENS) {
    return fullText;
  }

  const markerIndex = fullText.indexOf(marker);
  if (markerIndex === -1) {
    logger.error({ marker }, "Extract: Missing marker in document to process.");
    // Marker not found; should not happen
    // Return empty string to make sure we don't extract anything
    return "";
  }

  let result = marker;
  let remainingTokens = MAX_TOKENS - (await computeNbTokens(marker));

  // Start expanding before the marker
  let start = markerIndex;
  while (remainingTokens > 0 && start > 0) {
    const nextChunk = fullText.substring(
      Math.max(0, start - CHUNK_SIZE),
      start
    );
    const chunkTokens = await computeNbTokens(nextChunk);
    if (chunkTokens < remainingTokens) {
      start = Math.max(0, start - CHUNK_SIZE);
      result = nextChunk + result;
      remainingTokens -= chunkTokens;
    } else {
      break;
    }
  }

  // Start expanding after the marker
  let end = markerIndex + marker.length;
  while (remainingTokens > 0 && end < fullText.length) {
    const nextChunk = fullText.substring(
      end,
      Math.min(fullText.length, end + CHUNK_SIZE)
    );
    const chunkTokens = await computeNbTokens(nextChunk);
    if (chunkTokens < remainingTokens) {
      end = Math.min(fullText.length, end + CHUNK_SIZE);
      result += nextChunk;
      remainingTokens -= chunkTokens;
    } else {
      break;
    }
  }

  return result;
}

/**
 * Calling Core API to get the number of tokens in a text.
 * @param text
 * @returns number of tokens
 */
export async function computeNbTokens(text: string): Promise<number> {
  const tokensInDocumentText = await CoreAPI.tokenize({
    text: text,
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
    return 0;
  }

  console.log(tokensInDocumentText.value);

  return tokensInDocumentText.value.tokens.length;
}

export async function _getMaxTextContentToProcess({
  fullText,
  marker,
}: {
  fullText: string;
  marker: string;
}): Promise<string> {
  const MAX_TOKENS = 6000;

  // If the text is small enough, just return it
  const totalTokens = await computeNbTokens(fullText);
  if (totalTokens < MAX_TOKENS) {
    return fullText;
  }

  const markerIndex = fullText.indexOf(marker);
  if (markerIndex === -1) {
    // Marker not found; return an empty string or some default value
    return "";
  }

  let result = marker;
  let remainingTokens = MAX_TOKENS - (await computeNbTokens(marker));

  const BATCH_SIZE = 1000; // Number of characters in each batch

  // Expand before the marker
  let start = markerIndex;
  while (remainingTokens > 0 && start > 0) {
    const nextChunkStart = Math.max(0, start - BATCH_SIZE);
    const nextChunk = fullText.substring(nextChunkStart, start);
    const chunkTokens = await computeNbTokens(nextChunk);

    if (chunkTokens <= remainingTokens) {
      start = nextChunkStart;
      result = nextChunk + result;
      remainingTokens -= chunkTokens;
    } else {
      // Further divide the chunk to fit into remaining tokens
      for (let i = nextChunk.length; i >= 0; i -= 10) {
        const subChunk = nextChunk.substring(0, i);
        const subChunkTokens = await computeNbTokens(subChunk);
        if (subChunkTokens <= remainingTokens) {
          result = subChunk + result;
          remainingTokens -= subChunkTokens;
          break;
        }
      }
      break;
    }
  }

  // Expand after the marker
  let end = markerIndex + marker.length;
  while (remainingTokens > 0 && end < fullText.length) {
    const nextChunkEnd = Math.min(fullText.length, end + BATCH_SIZE);
    const nextChunk = fullText.substring(end, nextChunkEnd);
    const chunkTokens = await computeNbTokens(nextChunk);

    if (chunkTokens <= remainingTokens) {
      end = nextChunkEnd;
      result += nextChunk;
      remainingTokens -= chunkTokens;
    } else {
      // Further divide the chunk to fit into remaining tokens
      for (let i = 1; i <= nextChunk.length; i += 10) {
        const subChunk = nextChunk.substring(0, i);
        const subChunkTokens = await computeNbTokens(subChunk);
        if (subChunkTokens <= remainingTokens) {
          result += subChunk;
          remainingTokens -= subChunkTokens;
          break;
        }
      }
      break;
    }
  }

  return result;
}
