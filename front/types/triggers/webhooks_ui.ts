import { FATHOM_WEBHOOK_PRESET_UI } from "@app/lib/triggers/built-in-webhooks/fathom/preset_ui";
import { GITHUB_WEBHOOK_PRESET_UI } from "@app/lib/triggers/built-in-webhooks/github/preset_ui";
import { JIRA_WEBHOOK_PRESET_UI } from "@app/lib/triggers/built-in-webhooks/jira/preset_ui";
import { LINEAR_WEBHOOK_PRESET_UI } from "@app/lib/triggers/built-in-webhooks/linear/preset_ui";
import { ZENDESK_WEBHOOK_PRESET_UI } from "@app/lib/triggers/built-in-webhooks/zendesk/preset_ui";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import type { PresetWebhookUi } from "@app/types/triggers/webhooks_source_preset";

// Full presets including React components. Only import this from UI code
// (components, pages), never from temporal workers or server-side lib code.
export const WEBHOOK_PRESETS_UI = {
  fathom: FATHOM_WEBHOOK_PRESET_UI,
  github: GITHUB_WEBHOOK_PRESET_UI,
  jira: JIRA_WEBHOOK_PRESET_UI,
  linear: LINEAR_WEBHOOK_PRESET_UI,
  zendesk: ZENDESK_WEBHOOK_PRESET_UI,
} satisfies {
  [P in WebhookProvider]: PresetWebhookUi<P>;
};
