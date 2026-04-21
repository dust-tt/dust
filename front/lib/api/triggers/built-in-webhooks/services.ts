import { FathomWebhookService } from "@app/lib/api/triggers/built-in-webhooks/fathom/service";
import { GitHubWebhookService } from "@app/lib/api/triggers/built-in-webhooks/github/service";
import { JiraWebhookService } from "@app/lib/api/triggers/built-in-webhooks/jira/service";
import { LinearWebhookService } from "@app/lib/api/triggers/built-in-webhooks/linear/service";
import { ZendeskWebhookService } from "@app/lib/api/triggers/built-in-webhooks/zendesk/service";
import type { RemoteWebhookService } from "@app/types/triggers/remote_webhook_service";
import type { WebhookProvider } from "@app/types/triggers/webhooks";

// Server-only map of webhook service instances. MUST NOT be imported from
// components/, hooks/, or any module that ends up in the client bundle — each
// service transitively imports OAuthAPI and @app/lib/api/config.
//
// Typed against the interface (not inferred from the classes) so that dynamic
// lookups by WebhookProvider union see the shared `Record<string, unknown>`
// parameter shape rather than intersecting each class's narrower signature.
export const WEBHOOK_SERVICES: {
  [P in WebhookProvider]: RemoteWebhookService<P>;
} = {
  fathom: new FathomWebhookService(),
  github: new GitHubWebhookService(),
  jira: new JiraWebhookService(),
  linear: new LinearWebhookService(),
  zendesk: new ZendeskWebhookService(),
};
