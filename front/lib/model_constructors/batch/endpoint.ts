import { Client } from "@app/lib/model_constructors/client";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import type { NonDeltaResponseEvent } from "@app/lib/model_constructors/types/output/events";

export type BatchStatus = "ready" | "computing";

export type BatchRequest<C extends InputConfig = InputConfig> = {
  payload: Payload;
  config: C;
};

// Generic over the raw request payload `I` and per-request result `R`.
export abstract class BatchEndpoint<
  I = unknown,
  R = unknown,
  C extends InputConfig = InputConfig,
> extends Client<C> {
  abstract sendBatch(requests: Map<string, BatchRequest<C>>): Promise<string>;
  abstract getBatchStatus(batchId: string): Promise<BatchStatus>;
  abstract getBatchResult(
    batchId: string
  ): Promise<Map<string, NonDeltaResponseEvent[]>>;
  abstract deleteBatch(batchId: string): Promise<boolean>;
  abstract rawBatchOutputToEvents(raw: R): NonDeltaResponseEvent[];
  abstract buildRequestPayload(payload: Payload, config: C): I;
}
