import { FATHOM_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/fathom/preset";
import { FathomWebhookService } from "@app/lib/triggers/built-in-webhooks/fathom/service";
import { GITHUB_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/github/preset";
import { GitHubWebhookService } from "@app/lib/triggers/built-in-webhooks/github/service";
import { JIRA_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/jira/preset";
import { JiraWebhookService } from "@app/lib/triggers/built-in-webhooks/jira/service";
import { LINEAR_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/linear/preset";
import { LinearWebhookService } from "@app/lib/triggers/built-in-webhooks/linear/service";
import { ZENDESK_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/zendesk/preset";
import { ZendeskWebhookService } from "@app/lib/triggers/built-in-webhooks/zendesk/service";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import type { ServerPresetWebhook } from "@app/types/triggers/webhooks_source_preset";

// Server-only registry it includes webhookService instances. Never import this
// from the SPA. It pulls in oauth_api.ts -> undici.
export const WEBHOOK_PRESETS_SERVER: {
  [_P in WebhookProvider]: ServerPresetWebhook<P>;
} = {
  fathom: {
    ...FATHOM_WEBHOOK_PRESET,
    webhookService: new FathomWebhookService(),
  },
  github: {
    ...GITHUB_WEBHOOK_PRESET,
    webhookService: new GitHubWebhookService(),
  },
  jira: { ...JIRA_WEBHOOK_PRESET, webhookService: new JiraWebhookService() },
  linear: {
    ...LINEAR_WEBHOOK_PRESET,
    webhookService: new LinearWebhookService(),
  },
  zendesk: {
    ...ZENDESK_WEBHOOK_PRESET,
    webhookService: new ZendeskWebhookService(),
  },
};
