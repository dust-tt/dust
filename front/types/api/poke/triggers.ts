import type {
  TriggerKind,
  TriggerOrigin,
  TriggerStatus,
  WebhookRequestTriggerStatus,
} from "@app/types/assistant/triggers";
import type { WebhookProvider } from "@app/types/triggers/webhooks";

export type PokeAgentTriggerRow = {
  triggerId: string;
  name: string;
  agent: {
    agentId: string;
    name: string;
    isAvailable: boolean;
  };
  kind: TriggerKind;
  origin: TriggerOrigin;
  provider: WebhookProvider | null;
  configurationSummary: string;
  status: TriggerStatus;
  editor: {
    name: string;
    email: string | null;
  } | null;
  createdAt: number;
};

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
