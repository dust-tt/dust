import { FathomWebhookService } from "@app/lib/triggers/built-in-webhooks/fathom/service";
import { FATHOM_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/fathom/preset";
import { GitHubWebhookService } from "@app/lib/triggers/built-in-webhooks/github/service";
import { GITHUB_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/github/preset";
import { JiraWebhookService } from "@app/lib/triggers/built-in-webhooks/jira/service";
import { JIRA_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/jira/preset";
import { LinearWebhookService } from "@app/lib/triggers/built-in-webhooks/linear/service";
import { LINEAR_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/linear/preset";
import { ZendeskWebhookService } from "@app/lib/triggers/built-in-webhooks/zendesk/service";
import { ZENDESK_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/zendesk/preset";
import type { ServerPresetWebhook } from "@app/types/triggers/webhooks_source_preset";
import type { WebhookProvider } from "@app/types/triggers/webhooks";

// Server-only registry — includes webhookService instances. Never import this
// from the SPA; it pulls in oauth_api.ts → undici.
export const WEBHOOK_PRESETS_SERVER: {
  [P in WebhookProvider]: ServerPresetWebhook<P>;
} = {
  fathom: { ...FATHOM_WEBHOOK_PRESET, webhookService: new FathomWebhookService() },
  github: { ...GITHUB_WEBHOOK_PRESET, webhookService: new GitHubWebhookService() },
  jira: { ...JIRA_WEBHOOK_PRESET, webhookService: new JiraWebhookService() },
  linear: { ...LINEAR_WEBHOOK_PRESET, webhookService: new LinearWebhookService() },
  zendesk: { ...ZENDESK_WEBHOOK_PRESET, webhookService: new ZendeskWebhookService() },
};
