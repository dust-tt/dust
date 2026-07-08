import type {
  WebhookSourceForAdminType,
  WebhookSourceViewType,
  WebhookSourceWithViewsAndUsageType,
} from "@app/types/triggers/webhooks";
import { WebhookSourcesSchema } from "@app/types/triggers/webhooks";
import { z } from "zod";

export type GetWebhookSourceViewsResponseBody = {
  success: boolean;
  webhookSourceViews: WebhookSourceViewType[];
};

export type PostWebhookSourceViewResponseBody = {
  success: boolean;
  webhookSourceView: WebhookSourceViewType;
};

export const PostWebhookSourceViewBodySchema = z.object({
  webhookSourceId: z.string(),
});

export const PostWebhookSourcesSchema = WebhookSourcesSchema;

export type PostWebhookSourcesBody = z.infer<typeof PostWebhookSourcesSchema>;

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

export type PatchWebhookSourceResponseBody = {
  success: true;
};

export type GetWebhookSourceViewsForSourceResponseBody = {
  success: true;
  views: WebhookSourceViewType[];
};
