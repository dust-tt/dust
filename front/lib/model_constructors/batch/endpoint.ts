import { Client } from "@app/lib/model_constructors/client";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import type {
  EventMetadata,
  NonDeltaResponseEvent,
} from "@app/lib/model_constructors/types/output/events";

// "ready" once the provider has finished processing the whole batch, "computing"
// while any request is still in flight.
export type BatchStatus = "ready" | "computing";

// One request to enqueue in a batch: the provider-agnostic conversation/config,
// which `buildRequestPayload` turns into the provider's per-request payload —
// identical to its streaming counterpart.
export type BatchRequest = { payload: Payload; config: InputConfig };

// Batch inference. The sibling of `StreamEndpoint`: it shares `ModelClient`'s
// identity, credentials, and `buildRequestPayload`, but instead of streaming it
// submits a set of requests, polls for completion, and converts each completed
// raw result `R` into events. `rawBatchOutputToEvents` returns a non-streaming
// event array (no delta heartbeats) since the whole response is available at
// once. Generic over the raw request payload `I` and raw per-request result `R`.
export abstract class BatchEndpoint<I = unknown, R = unknown> extends Client {
  // Submits a batch keyed by caller-provided custom ids; returns the batch id.
  abstract sendBatch(requests: Map<string, BatchRequest>): Promise<string>;
  abstract getBatchStatus(batchId: string): Promise<BatchStatus>;
  // Resolves once the batch has ended, mapping each custom id to its events.
  abstract getBatchResult(
    batchId: string
  ): Promise<Map<string, NonDeltaResponseEvent[]>>;
  abstract deleteBatch(batchId: string): Promise<boolean>;
  abstract rawBatchOutputToEvents(raw: R): NonDeltaResponseEvent[];
  abstract buildRequestPayload(payload: Payload, config: InputConfig): I;

  // The model identity stamped onto every output event, derived from the
  // concrete subclass's static configuration fields.
  metadata(): EventMetadata {
    return {
      providerId: this.constructor.providerId,
      api: this.constructor.api,
      region: this.constructor.region,
      modelId: this.constructor.modelId,
    };
  }
}
