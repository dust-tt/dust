import { Button, ExternalLinkIcon, Label, Spinner } from "@dust-tt/sparkle";
import { useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import type { LightWorkspaceType, OAuthConnectionType } from "@app/types";
import { setupOAuthConnection } from "@app/types";
import type { WebhookSourceKind } from "@app/types/triggers/webhooks";
import { WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP } from "@app/types/triggers/webhooks";

type CreateWebhookSourceWithProviderFormProps = {
  owner: LightWorkspaceType;
  kind: Exclude<WebhookSourceKind, "custom" | "test">;
  onDataToCreateWebhookChange?: (
    data: {
      connectionId: string;
      remoteMetadata: Record<string, unknown>;
    } | null
  ) => void;
  onReadyToSubmitChange?: (isReady: boolean) => void;
};

/**
 * Component containing the form part common to all the providers (select events, create OAuth connection...)
 */
export function CreateWebhookSourceWithProviderForm({
  owner,
  kind,
  onDataToCreateWebhookChange,
  onReadyToSubmitChange,
}: CreateWebhookSourceWithProviderFormProps) {
  const sendNotification = useSendNotification();
  const [oauthConnection, setOauthConnection] =
    useState<OAuthConnectionType | null>(null);
  const [isConnectingProvider, setIsConnectingToProvider] = useState(false);

  const preset = WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[kind];
  const kindName = preset.name;

  const handleConnectToProvider = async () => {
    if (!owner) {
      return;
    }

    setIsConnectingToProvider(true);
    try {
      const connectionRes = await setupOAuthConnection({
        dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
        owner,
        provider: kind,
        useCase: "webhooks",
        extraConfig: {},
      });

      if (connectionRes.isErr()) {
        sendNotification({
          type: "error",
          title: `Failed to connect to ${kindName}`,
          description: connectionRes.error.message,
        });
      } else {
        setOauthConnection(connectionRes.value);
        sendNotification({
          type: "success",
          title: `Connected to ${kindName}`,
          description: "Fetching your repositories and organizations...",
        });
      }
    } catch (error) {
      sendNotification({
        type: "error",
        title: `Failed to connect to ${kindName}`,
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsConnectingToProvider(false);
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      <div>
        <Label>{kindName} Connection</Label>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Connect your {kindName} account to select repositories and
          organizations to follow.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant={"outline"}
            label={
              oauthConnection
                ? `Connected to ${kindName}`
                : `Connect to ${kindName}`
            }
            icon={preset.icon}
            onClick={handleConnectToProvider}
            disabled={isConnectingProvider || !!oauthConnection}
          />
          {oauthConnection && preset.webhookPageUrl && (
            <a
              href={preset.webhookPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-action-500 hover:text-action-600 dark:text-action-400 dark:hover:text-action-300 inline-flex items-center gap-1 text-sm"
            >
              Edit connection
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          )}
          {isConnectingProvider && <Spinner size="sm" />}
        </div>
      </div>

      {oauthConnection &&
        (() => {
          const CreateFormComponent =
            WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[kind].components
              .createFormComponent;
          return (
            <CreateFormComponent
              owner={owner}
              kind={kind}
              onDataToCreateWebhookChange={onDataToCreateWebhookChange}
              onReadyToSubmitChange={onReadyToSubmitChange}
              connectionId={oauthConnection.connection_id}
            />
          );
        })()}
    </div>
  );
}
