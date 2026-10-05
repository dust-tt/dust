import { FATHOM_WEBHOOK_METADATA } from "@app/lib/triggers/built-in-webhooks/fathom/preset";
import { GITHUB_WEBHOOK_METADATA } from "@app/lib/triggers/built-in-webhooks/github/preset";
import { JIRA_WEBHOOK_METADATA } from "@app/lib/triggers/built-in-webhooks/jira/preset";
import { LINEAR_WEBHOOK_METADATA } from "@app/lib/triggers/built-in-webhooks/linear/preset";
import { ZENDESK_WEBHOOK_METADATA } from "@app/lib/triggers/built-in-webhooks/zendesk/preset";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import type { WebhookPresetMetadata } from "@app/types/triggers/webhooks_source_preset";

export const WEBHOOK_PRESETS: Record<WebhookProvider, WebhookPresetMetadata> = {
  fathom: FATHOM_WEBHOOK_METADATA,
  github: GITHUB_WEBHOOK_METADATA,
  jira: JIRA_WEBHOOK_METADATA,
  linear: LINEAR_WEBHOOK_METADATA,
  zendesk: ZENDESK_WEBHOOK_METADATA,
};
