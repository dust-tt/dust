import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceForAdminType } from "@app/types/triggers/webhooks";

/**
 * Props interface for webhook details components.
 * These components display information about an existing webhook source.
 */
export interface WebhookDetailsComponentProps {
  webhookSource: WebhookSourceForAdminType;
}

/**
 * Generic props interface for webhook creation form components.
 * TServiceData is the specific service data type returned by the preset's service.
 * These components handle service-specific configuration during webhook creation.
 */
export interface WebhookCreateFormComponentProps<
  TServiceData = Record<string, unknown>,
> {
  owner: LightWorkspaceType;
  serviceData: TServiceData | null;
  isFetchingServiceData: boolean;
  onFetchServiceData: (connectionId: string) => Promise<void>;
  onDataToCreateWebhookChange?: (
    data: {
      connectionId: string;
      remoteMetadata: Record<string, unknown>;
    } | null
  ) => void;
  onReadyToSubmitChange?: (isReady: boolean) => void;
}
