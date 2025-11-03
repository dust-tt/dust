import {
  Button,
  CloudArrowLeftRightIcon,
  Label,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import type { LightWorkspaceType, OAuthConnectionType } from "@app/types";
import { normalizeError, setupOAuthConnection } from "@app/types";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import { WEBHOOK_PRESETS } from "@app/types/triggers/webhooks";

type CreateWebhookSourceWithProviderFormProps = {
  owner: LightWorkspaceType;
  provider: Exclude<WebhookProvider, "test">;
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
  provider,
  onDataToCreateWebhookChange,
  onReadyToSubmitChange,
}: CreateWebhookSourceWithProviderFormProps) {
  const sendNotification = useSendNotification();
  const [connection, setConnection] = useState<OAuthConnectionType | null>(
    null
  );
  const [isConnectingProvider, setIsConnectingToProvider] = useState(false);
  const [extraConfig, setExtraConfig] = useState<Record<string, string>>({});
  const [isExtraConfigValid, setIsExtraConfigValid] = useState(false);

  const preset = WEBHOOK_PRESETS[provider];
  const OAuthExtraConfigInput = preset.components.oauthExtraConfigInput;

  const handleConnectToProvider = async () => {
    if (!owner) {
      return;
    }

    setIsConnectingToProvider(true);
    try {
      const connectionRes = await setupOAuthConnection({
        dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
        owner,
        provider,
        useCase: "webhooks",
        extraConfig,
      });

      if (connectionRes.isErr()) {
        sendNotification({
          type: "error",
          title: `Failed to connect to ${preset.name}`,
          description: connectionRes.error.message,
        });
      } else {
        setConnection(connectionRes.value);
        sendNotification({
          type: "success",
          title: `Connected to ${preset.name}`,
          description: "Fetching additional data for configuration...",
        });
      }
    } catch (error) {
      sendNotification({
        type: "error",
        title: `Failed to connect to ${preset.name}`,
        description: normalizeError(error).message,
      });
    } finally {
      setIsConnectingToProvider(false);
    }
  };
  const hasConnectionPage = !!preset.webhookPageUrl;
  const buttonLabel = connection
    ? hasConnectionPage
      ? `Edit connection`
      : `Connected`
    : `Connect`;

  return (
    <div className="flex flex-col space-y-4">
      <div>
        <Label>{preset.name} Connection</Label>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {preset.name} connection is required
        </p>
        {OAuthExtraConfigInput && (
          <div className="mt-4">
            <OAuthExtraConfigInput
              extraConfig={extraConfig}
              setExtraConfig={setExtraConfig}
              setIsExtraConfigValid={setIsExtraConfigValid}
            />
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          <Button
            variant={"outline"}
            label={buttonLabel}
            icon={CloudArrowLeftRightIcon}
            // if we are not connected, click starts the OAuth flow
            // if we are connected with a connection page URL, click opens that page
            // otherwise button is disabled
            onClick={
              connection
                ? () => window.open(preset.webhookPageUrl, "_blank")
                : handleConnectToProvider
            }
            disabled={
              isConnectingProvider ||
              (!!connection && !hasConnectionPage) ||
              (OAuthExtraConfigInput ? !isExtraConfigValid : false)
            }
          />
          {isConnectingProvider && <Spinner size="sm" />}
        </div>
      </div>

      {connection &&
        (() => {
          const CreateFormComponent =
            WEBHOOK_PRESETS[provider].components.createFormComponent;
          return (
            <CreateFormComponent
              owner={owner}
              onDataToCreateWebhookChange={onDataToCreateWebhookChange}
              onReadyToSubmitChange={onReadyToSubmitChange}
              connectionId={connection.connection_id}
            />
          );
        })()}
    </div>
  );
}
