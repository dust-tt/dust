import { FATHOM_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/fathom/preset";
import { GITHUB_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/github/preset";
import { JIRA_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/jira/preset";
import { LINEAR_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/linear/preset";
import { ZENDESK_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/zendesk/preset";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import type { BaseWebhookPreset } from "@app/types/triggers/webhooks_source_preset";

export const WEBHOOK_PRESETS = {
  fathom: FATHOM_WEBHOOK_PRESET,
  github: GITHUB_WEBHOOK_PRESET,
  jira: JIRA_WEBHOOK_PRESET,
  linear: LINEAR_WEBHOOK_PRESET,
  zendesk: ZENDESK_WEBHOOK_PRESET,
} satisfies Record<WebhookProvider, BaseWebhookPreset>;
