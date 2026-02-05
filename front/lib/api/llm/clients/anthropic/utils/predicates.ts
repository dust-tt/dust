import assert from "node:assert";

import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta.mjs";

import type { StreamState } from "@app/lib/api/llm/clients/anthropic/utils/types";

export function validateHasState(
  state: StreamState
): asserts state is Exclude<StreamState, null> {
  assert(state !== null, "No content block is currently being processed");
}

export function validateContentBlockIndex(
  state: StreamState,
  event:
    | Extract<BetaRawMessageStreamEvent, { type: "content_block_delta" }>
    | Extract<BetaRawMessageStreamEvent, { type: "content_block_stop" }>
): asserts state is Exclude<StreamState, null> {
  validateHasState(state);
  assert(
    state.currentBlockIndex === event.index,
    `Mismatched content block index: expected ${state.currentBlockIndex}, got ${event.index}`
  );
}
