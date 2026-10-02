import type {
  WebhookCreateFormComponentProps,
  WebhookDetailsComponentProps,
} from "@app/components/triggers/webhook_preset_components";
import type { ConnectorOauthExtraConfigProps } from "@app/lib/connector_providers_ui";
import { FATHOM_CLIENT_SIDE_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/fathom/client_side";
import { GITHUB_CLIENT_SIDE_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/github/client_side";
import { JIRA_CLIENT_SIDE_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/jira/client_side";
import { LINEAR_CLIENT_SIDE_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/linear/client_side";
import { ZENDESK_CLIENT_SIDE_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/zendesk/client_side";
import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/types/resources_icon_names";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import type { BaseWebhookPreset } from "@app/types/triggers/webhooks_source_preset";
import type React from "react";

// Full presets including icon and React components. Only import this from UI
// code (components, pages), never from temporal workers or server-side lib code.
export const CLIENT_SIDE_WEBHOOK_PRESETS = {
  fathom: FATHOM_CLIENT_SIDE_WEBHOOK_PRESET,
  github: GITHUB_CLIENT_SIDE_WEBHOOK_PRESET,
  jira: JIRA_CLIENT_SIDE_WEBHOOK_PRESET,
  linear: LINEAR_CLIENT_SIDE_WEBHOOK_PRESET,
  zendesk: ZENDESK_CLIENT_SIDE_WEBHOOK_PRESET,
} satisfies Record<WebhookProvider, ClientSideWebhookPreset>;

export type ClientSideWebhookPreset = BaseWebhookPreset & {
  icon: InternalAllowedIconType | CustomResourceIconType;

  // React components to render the webhook details and creation form.
  components: {
    detailsComponent: React.ComponentType<WebhookDetailsComponentProps>;
    createFormComponent: React.ComponentType<WebhookCreateFormComponentProps>;
    oauthExtraConfigInput?: React.ComponentType<ConnectorOauthExtraConfigProps>;
  };
};
