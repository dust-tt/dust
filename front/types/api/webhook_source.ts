import type {
  WebhookProvider,
  WebhookSourceForAdminType,
  WebhookSourceSignatureAlgorithm,
  WebhookSourceViewType,
  WebhookSourceWithViewsAndUsageType,
} from "@app/types/triggers/webhooks";

export type GetWebhookSourceViewsResponseBody = {
  success: boolean;
  webhookSourceViews: WebhookSourceViewType[];
};

export type PostWebhookSourceViewResponseBody = {
  success: boolean;
  webhookSourceView: WebhookSourceViewType;
};

export type PostWebhookSourcesBody = {
  name: string;
  secret: string | null;
  signatureHeader: string;
  signatureAlgorithm: WebhookSourceSignatureAlgorithm;
  includeGlobal?: boolean;
  subscribedEvents: string[];
  provider: WebhookProvider | null;
  connectionId?: string;
  remoteMetadata?: Record<string, any>;
  icon?: string;
  description?: string;
};

export type GetWebhookSourcesResponseBody = {
  success: true;
  webhookSourcesWithViews: WebhookSourceWithViewsAndUsageType[];
};

export type PostWebhookSourcesResponseBody = {
  success: true;
  webhookSource: WebhookSourceForAdminType;
};

export type DeleteWebhookSourceResponseBody = {
  success: true;
};

export type GetWebhookSourceViewsForSourceResponseBody = {
  success: true;
  views: WebhookSourceViewType[];
};
