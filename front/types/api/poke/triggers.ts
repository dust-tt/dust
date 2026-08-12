import type { WebhookRequestTriggerStatus } from "@app/types/assistant/triggers";

export interface PokeGetWebhookRequestsResponseBody {
  requests: {
    id: number;
    timestamp: number;
    status: WebhookRequestTriggerStatus;
    errorMessage: string | null;
    payload?: {
      headers?: Record<string, string | string[]>;
      body?: unknown;
    };
  }[];
}
