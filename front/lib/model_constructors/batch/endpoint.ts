import { Client } from "@app/lib/model_constructors/client";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import type { NonDeltaResponseEvent } from "@app/lib/model_constructors/types/output/events";

export type BatchStatus = "ready" | "computing";

export type BatchRequest = { payload: Payload; config: InputConfig };

// Generic over the raw request payload `I` and per-request result `R`.
export abstract class BatchEndpoint<I = unknown, R = unknown> extends Client {
  abstract sendBatch(requests: Map<string, BatchRequest>): Promise<string>;
  abstract getBatchStatus(batchId: string): Promise<BatchStatus>;
  abstract getBatchResult(
    batchId: string
  ): Promise<Map<string, NonDeltaResponseEvent[]>>;
  abstract deleteBatch(batchId: string): Promise<boolean>;
  abstract rawBatchOutputToEvents(raw: R): NonDeltaResponseEvent[];
  abstract buildRequestPayload(payload: Payload, config: InputConfig): I;
}
