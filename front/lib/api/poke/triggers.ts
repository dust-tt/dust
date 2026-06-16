import type { TriggerWithProviderAndEditor } from "@app/lib/triggers/admin/list_with_metadata";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  TriggerType,
  WebhookRequestTriggerStatus,
} from "@app/types/assistant/triggers";
import type { UserType } from "@app/types/user";

export type TriggerWithProviderType = TriggerWithProviderAndEditor;

export type PokeListTriggers = {
  triggers: TriggerWithProviderType[];
};

export interface PokeGetWebhookRequestsResponseBody {
  requests: {
    id: number;
    timestamp: number;
    status: WebhookRequestTriggerStatus;
    payload?: {
      headers?: Record<string, string | string[]>;
      body?: unknown;
    };
  }[];
}

export type PokeGetTriggerExecutionStats = {
  statusBreakdown: Record<string, number>;
  dailyVolume: Array<{
    date: string;
    succeeded: number;
    failed: number;
    notMatched: number;
    rateLimited: number;
  }>;
};

export type PokeGetTriggerDetails = {
  trigger: TriggerType;
  agent: LightAgentConfigurationType;
  editorUser: UserType | null;
};
