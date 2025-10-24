import {
  Button,
  Checkbox,
  ClipboardIcon,
  ExternalLinkIcon,
  Label,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import type { WebhookCreateFormComponentProps } from "@app/components/triggers/webhook_preset_components";
import { useSendNotification } from "@app/hooks/useNotification";
import type {
  FathomAdditionalData,
  FathomWebhookOptions,
} from "@app/lib/triggers/built-in-webhooks/fathom/fathom_service_types";
import { FathomAdditionalDataSchema } from "@app/lib/triggers/built-in-webhooks/fathom/fathom_service_types";
import type { OAuthConnectionType } from "@app/types";
import { setupOAuthConnection } from "@app/types";

function isFathomAdditionalData(
  data: Record<string, unknown> | null
): data is FathomAdditionalData {
  if (!data) {
    return false;
  }

  const result = FathomAdditionalDataSchema.safeParse(data);
  return result.success;
}

export function CreateWebhookFathomConnection({
  owner,
  serviceData,
  isFetchingServiceData,
  onFetchServiceData,
  onDataToCreateWebhookChange,
  onReadyToSubmitChange,
}: WebhookCreateFormComponentProps) {
  const sendNotification = useSendNotification();
  const [fathomConnection, setFathomConnection] =
    useState<OAuthConnectionType | null>(null);
  const [isConnectingFathom, setIsConnectingFathom] = useState(false);

  const fathomData = isFathomAdditionalData(serviceData) ? serviceData : null;

  // Initialize webhook options with all enabled by default
  const [webhookOptions, setWebhookOptions] = useState<FathomWebhookOptions>({
    include_transcript: true,
    include_summary: true,
    include_action_items: true,
    include_crm_matches: true,
  });

  // Notify parent component when data changes
  useEffect(() => {
    const hasAtLeastOneOption =
      webhookOptions.include_transcript ||
      webhookOptions.include_summary ||
      webhookOptions.include_action_items ||
      webhookOptions.include_crm_matches;

    const isReady = !!(fathomConnection && hasAtLeastOneOption);

    if (isReady && onDataToCreateWebhookChange) {
      onDataToCreateWebhookChange({
        connectionId: fathomConnection.connection_id,
        remoteMetadata: {
          webhookOptions,
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
    fathomConnection,
    webhookOptions,
    onDataToCreateWebhookChange,
    onReadyToSubmitChange,
  ]);

  const handleConnectFathom = async () => {
    if (!owner) {
      return;
    }

    setIsConnectingFathom(true);
    try {
      const connectionRes = await setupOAuthConnection({
        dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
        owner,
        provider: "fathom",
        useCase: "webhooks",
        extraConfig: {},
      });

      if (connectionRes.isErr()) {
        sendNotification({
          type: "error",
          title: "Failed to connect to Fathom",
          description: connectionRes.error.message,
        });
      } else {
        setFathomConnection(connectionRes.value);
        sendNotification({
          type: "success",
          title: "Connected to Fathom",
          description: "Your Fathom account is now connected.",
        });
        // Fetch service data after successful connection
        await onFetchServiceData(connectionRes.value.connection_id);
      }
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect to Fathom",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsConnectingFathom(false);
    }
  };

  const handleToggleOption = (option: keyof FathomWebhookOptions) => {
    setWebhookOptions((prev) => ({
      ...prev,
      [option]: !prev[option],
    }));
  };

  const hasAtLeastOneOption =
    webhookOptions.include_transcript ||
    webhookOptions.include_summary ||
    webhookOptions.include_action_items ||
    webhookOptions.include_crm_matches;

  return (
    <div className="flex flex-col space-y-4">
      <div>
        <Label>Fathom Connection</Label>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Connect your Fathom account to receive meeting notifications.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant={"outline"}
            label={fathomConnection ? "Connected to Fathom" : "Connect to Fathom"}
            icon={ClipboardIcon}
            onClick={handleConnectFathom}
            disabled={isConnectingFathom || !!fathomConnection}
          />
          {fathomConnection && (
            <a
              href="https://app.fathom.video/settings/integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-action-500 hover:text-action-600 dark:text-action-400 dark:hover:text-action-300 inline-flex items-center gap-1 text-sm"
            >
              Edit connection
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          )}
          {isConnectingFathom && <Spinner size="sm" />}
        </div>
      </div>

      {fathomConnection && (
        <>
          <div>
            <Label>
              Webhook Options{" "}
              {!hasAtLeastOneOption && (
                <span className="text-warning">*</span>
              )}
            </Label>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Choose what information to include in webhook payloads. At least
              one option must be selected.
            </p>
            {isFetchingServiceData ? (
              <div className="mt-2 flex items-center gap-2 py-2">
                <Spinner size="sm" />
                <span className="text-sm text-muted-foreground">
                  Loading options...
                </span>
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-3">
                <Checkbox
                  checked={webhookOptions.include_transcript}
                  onChange={() => handleToggleOption("include_transcript")}
                  label="Include transcript"
                  description="Include meeting transcripts with speaker information and timestamps"
                />
                <Checkbox
                  checked={webhookOptions.include_summary}
                  onChange={() => handleToggleOption("include_summary")}
                  label="Include summary"
                  description="Include AI-generated meeting summaries"
                />
                <Checkbox
                  checked={webhookOptions.include_action_items}
                  onChange={() => handleToggleOption("include_action_items")}
                  label="Include action items"
                  description="Include action items extracted from the meeting"
                />
                <Checkbox
                  checked={webhookOptions.include_crm_matches}
                  onChange={() => handleToggleOption("include_crm_matches")}
                  label="Include CRM matches"
                  description="Include linked CRM contacts, companies, and deals"
                />
              </div>
            )}
            {!hasAtLeastOneOption && (
              <p className="dark:text-warning-night mt-2 text-xs text-warning">
                Please select at least one option to include in webhook payloads
              </p>
            )}
          </div>

          <div className="border-border-light dark:border-border-dark rounded border p-3">
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              <strong>Note:</strong> This webhook will be triggered for team
              recordings when meeting content is ready.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
