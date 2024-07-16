import type { Result } from "@dust-tt/types";
import { CoreAPI, Err, Ok, safeSubstring } from "@dust-tt/types";
import _ from "lodash";

import logger from "@app/logger/logger";

import config from "./api/config";

export async function tokenCountForTexts(
  texts: string[],
  model: { providerId: string; modelId: string }
): Promise<Result<Array<number>, Error>> {
  const BATCHES_COUNT = 3;
  try {
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const batches = _.chunk(texts, Math.ceil(texts.length / BATCHES_COUNT));
    const batchResults = await Promise.all(
      batches.map((batch) =>
        coreAPI.tokenizeBatch({
          texts: batch,
          providerId: model.providerId,
          modelId: model.modelId,
        })
      )
    );

    const counts: number[] = [];
    for (const res of batchResults) {
      if (res.isErr()) {
        return new Err(
          new Error(`Error tokenizing model message: ${res.error.message}`)
        );
      }
      for (const tokens of res.value.tokens) {
        counts.push(tokens.length);
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
