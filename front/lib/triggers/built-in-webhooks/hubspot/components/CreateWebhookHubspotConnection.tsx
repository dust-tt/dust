import {
  Button,
  HubspotLogo,
  Label,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import type { WebhookCreateFormComponentProps } from "@app/components/triggers/webhook_preset_components";
import { useSendNotification } from "@app/hooks/useNotification";
import type { HubspotAdditionalData } from "@app/lib/triggers/built-in-webhooks/hubspot/hubspot_service_types";
import { HubspotAdditionalDataSchema } from "@app/lib/triggers/built-in-webhooks/hubspot/hubspot_service_types";
import type { OAuthConnectionType } from "@app/types";
import { setupOAuthConnection } from "@app/types";

function isHubspotAdditionalData(
  data: Record<string, unknown> | null
): data is HubspotAdditionalData {
  if (!data) {
    return false;
  }

  const result = HubspotAdditionalDataSchema.safeParse(data);
  return result.success;
}

export function CreateWebhookHubspotConnection({
  owner,
  serviceData,
  isFetchingServiceData,
  onFetchServiceData,
  onDataToCreateWebhookChange,
  onReadyToSubmitChange,
}: WebhookCreateFormComponentProps) {
  const sendNotification = useSendNotification();
  const [hubspotConnection, setHubspotConnection] =
    useState<OAuthConnectionType | null>(null);
  const [isConnectingHubspot, setIsConnectingHubspot] = useState(false);
  const hubspotData = isHubspotAdditionalData(serviceData) ? serviceData : null;

  // Notify parent component when data changes
  useEffect(() => {
    const isReady = !!(hubspotConnection && hubspotData);

    if (isReady && onDataToCreateWebhookChange) {
      onDataToCreateWebhookChange({
        connectionId: hubspotConnection.connection_id,
        remoteMetadata: {
          appId: hubspotData.appId,
        },
      });
    } else if (onDataToCreateWebhookChange) {
      onDataToCreateWebhookChange(null);
    }

    // Notify parent about ready state
    if (onReadyToSubmitChange) {
      onReadyToSubmitChange(isReady);
    }
  }, [
    hubspotConnection,
    hubspotData,
    onDataToCreateWebhookChange,
    onReadyToSubmitChange,
  ]);

  const handleConnectHubspot = async () => {
    if (!owner) {
      return;
    }

    setIsConnectingHubspot(true);
    try {
      const connectionRes = await setupOAuthConnection({
        dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
        owner,
        provider: "hubspot",
        useCase: "webhooks",
        extraConfig: {},
      });

      if (connectionRes.isErr()) {
        sendNotification({
          type: "error",
          title: "Failed to connect to HubSpot",
          description: connectionRes.error.message,
        });
      } else {
        setHubspotConnection(connectionRes.value);
        sendNotification({
          type: "success",
          title: "Connected to HubSpot",
          description: "Fetching your account information...",
        });
        // Fetch service data after successful connection
        await onFetchServiceData(connectionRes.value.connection_id);
      }
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect to HubSpot",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsConnectingHubspot(false);
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      <div>
        <Label>HubSpot Connection</Label>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Connect your HubSpot account to receive webhook events for contacts,
          companies, deals, tickets, and products.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant={"outline"}
            label={
              hubspotConnection ? "Connected to HubSpot" : "Connect to HubSpot"
            }
            icon={HubspotLogo}
            onClick={handleConnectHubspot}
            disabled={isConnectingHubspot || !!hubspotConnection}
          />
          {isConnectingHubspot && <Spinner size="sm" />}
        </div>
      </div>

      {hubspotConnection && hubspotData && !isFetchingServiceData && (
        <div className="border-border-light bg-background-light dark:bg-background-dark rounded border px-4 py-3 dark:border-border-dark">
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Webhooks will be configured for all selected event types on this
            HubSpot account.
          </p>
        </div>
      )}
    </div>
  );
}
