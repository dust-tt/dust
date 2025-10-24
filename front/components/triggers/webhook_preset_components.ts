import type { LightWorkspaceType } from "@app/types";
import type {
  WebhookSourceForAdminType,
  WebhookSourceKind,
} from "@app/types/triggers/webhooks";

/**
 * Props interface for webhook details components.
 * These components display information about an existing webhook source.
 */
export interface WebhookDetailsComponentProps {
  webhookSource: WebhookSourceForAdminType;
}

/**
 * Props interface for webhook creation form components.
 * These components handle service-specific configuration during webhook creation.
 */
export interface WebhookCreateFormComponentProps {
  owner: LightWorkspaceType;
  kind: WebhookSourceKind;
  onDataToCreateWebhookChange?: (
    data: {
      connectionId: string;
      remoteMetadata: Record<string, unknown>;
    } | null
  ) => void;
  onReadyToSubmitChange?: (isReady: boolean) => void;
  connectionId: string;
}
