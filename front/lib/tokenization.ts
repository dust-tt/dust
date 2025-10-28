import _ from "lodash";

import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import {
  CoreAPI,
  DEFAULT_TOKEN_COUNT_ADJUSTMENT,
  Err,
  Ok,
  safeSubstring,
} from "@app/types";

import config from "./api/config";

// Limit batch size to prevent OOM issues in core API when tokenizing large payloads of text.
const MAX_BATCH_SIZE = 100;

export async function tokenCountForTexts(
  texts: string[],
  model: { providerId: string; modelId: string; tokenCountAdjustment?: number }
): Promise<Result<Array<number>, Error>> {
  const BATCHES_COUNT = 3;
  try {
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const batches = _.chunk(
      texts,
      Math.min(MAX_BATCH_SIZE, Math.ceil(texts.length / BATCHES_COUNT))
    );

    const batchResults = await concurrentExecutor(
      batches,
      async (batch) =>
        coreAPI.tokenizeBatchCount({
          texts: batch,
          providerId: model.providerId,
          modelId: model.modelId,
        }),
      { concurrency: 1 }
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
  model: { providerId: string; modelId: string },
  splitAt: number
): Promise<Result<string, Error>> {
  try {
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const res = await coreAPI.tokenize({
      text,
      providerId: model.providerId,
      modelId: model.modelId,
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
