import type { TriggerType } from "@app/types/assistant/triggers";
import type {
  WebhookSourceForAdminType,
  WebhookSourceType,
  WebhookSourceViewForAdminType,
} from "@app/types/triggers/webhooks";
import type { UserType } from "@app/types/user";

export type PokeListWebhookSources = {
  webhookSources: Array<
    WebhookSourceType & { viewCount: number; triggerCount: number }
  >;
};

export type PokeGetWebhookSourceDetails = {
  webhookSource: WebhookSourceForAdminType;
  views: WebhookSourceViewForAdminType[];
  triggers: Array<TriggerType & { editorUser: UserType | null }>;
  requestStats: { last24h: number; last7d: number; last30d: number };
};
