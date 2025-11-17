import _ from "lodash";

import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result, TokenizerConfig } from "@app/types";
import {
  CoreAPI,
  DEFAULT_TOKEN_COUNT_ADJUSTMENT,
  Err,
  Ok,
  safeSubstring,
} from "@app/types";

import config from "./api/config";

// Tokenizing large text payloads causes memory stress in core API, leading to OOM issues.
// We limit batch size to 100 texts per request to prevent memory exhaustion.
const MAX_BATCH_SIZE = 100;

// Limit concurrent requests to core API to avoid overloading.
const TOKENIZATION_CONCURRENCY = 3;

export async function tokenCountForTexts(
  texts: string[],
  model: {
    providerId: string;
    modelId: string;
    tokenCountAdjustment?: number;
    tokenizer: TokenizerConfig;
  }
): Promise<Result<Array<number>, Error>> {
  try {
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    // Split texts into batches to prevent OOM in core API.
    const batches = _.chunk(texts, MAX_BATCH_SIZE);

    const batchResults = await concurrentExecutor(
      batches,
      async (batch) =>
        coreAPI.tokenizeBatchCount({
          texts: batch,
          providerId: model.providerId,
          modelId: model.modelId,
          tokenizer: model.tokenizer,
        }),
      { concurrency: TOKENIZATION_CONCURRENCY }
    );

    const counts: number[] = [];
    for (const res of batchResults) {
      if (res.isErr()) {
        return new Err(
          new Error(`Error tokenizing model message: ${res.error.message}`)
        );
      }
      for (const count of res.value.counts) {
        counts.push(
          Math.round(
            count *
              (model.tokenCountAdjustment ?? DEFAULT_TOKEN_COUNT_ADJUSTMENT)
          )
        );
      }
    }

    return new Ok(counts);
  } catch (err) {
    return new Err(new Error(`Error tokenizing model message: ${err}`));
  }
}

export async function tokenSplit(
  text: string,
  model: { providerId: string; modelId: string; tokenizer: TokenizerConfig },
  splitAt: number
): Promise<Result<string, Error>> {
  try {
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const res = await coreAPI.tokenize({
      text,
      providerId: model.providerId,
      modelId: model.modelId,
      tokenizer: model.tokenizer,
    });
    if (res.isErr()) {
      return new Err(
        new Error(`Error tokenizing model message: ${res.error.message}`)
      );
    }
    const remainingText = res.value.tokens
      .slice(0, splitAt)
      .map(([, tokenText]) => tokenText)
      .join("");
    return new Ok(safeSubstring(remainingText, 0, remainingText.length));
  } catch (err) {
    return new Err(new Error(`Error tokenizing model message: ${err}`));
  }
}
