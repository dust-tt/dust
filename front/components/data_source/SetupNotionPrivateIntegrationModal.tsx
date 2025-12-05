import type { NotificationType } from "@dust-tt/sparkle";
import {
  Button,
  ClipboardCheckIcon,
  ClipboardIcon,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Page,
  Spinner,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { clientFetch } from "@app/lib/egress/client";
import type { GetNotionWebhookConfigResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/managed/notion/webhook_config";
import type { DataSourceType, LightWorkspaceType } from "@app/types";

interface SetupNotionPrivateIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataSource: DataSourceType;
  owner: LightWorkspaceType;
  onSuccess: (credentialId: string) => void;
  sendNotification: (notification: NotificationType) => void;
}

export function SetupNotionPrivateIntegrationModal({
  isOpen,
  onClose,
  dataSource,
  owner,
  onSuccess,
  sendNotification,
}: SetupNotionPrivateIntegrationModalProps) {
  const [integrationToken, setIntegrationToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webhookConfig, setWebhookConfig] =
    useState<GetNotionWebhookConfigResponseBody | null>(null);
  const [isLoadingWebhookConfig, setIsLoadingWebhookConfig] = useState(false);
  const [isCopiedWebhookUrl, copyWebhookUrl] = useCopyToClipboard();
  const [isCopiedToken, copyToken] = useCopyToClipboard();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const fetchWebhookConfig = async () => {
      setIsLoadingWebhookConfig(true);
      try {
        const response = await clientFetch(
          `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/notion/webhook_config`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch webhook configuration");
        }

        const data: GetNotionWebhookConfigResponseBody = await response.json();
        setWebhookConfig(data);
      } catch (err) {
        sendNotification({
          type: "error",
          title: "Failed to fetch webhook configuration",
          description: err instanceof Error ? err.message : "An error occurred",
        });
      } finally {
        setIsLoadingWebhookConfig(false);
      }
    };

    void fetchWebhookConfig();
  }, [isOpen, owner.sId, dataSource.sId, sendNotification]);

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await clientFetch(`/api/w/${owner.sId}/credentials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "notion",
          credentials: {
            integration_token: integrationToken,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        throw new Error(error.error?.message || "Failed to create credential");
      }

      const data = await response.json();
      const credentialId = data.credentials.id;

      // Set the credential ID on the connector
      const configRes = await clientFetch(
        `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/privateIntegrationCredentialId`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            configValue: credentialId,
          }),
        }
      );

      if (!configRes.ok) {
        const error = await configRes.json();
        throw new Error(
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          error.error?.message || "Failed to set connector configuration"
        );
      }

      sendNotification({
        type: "success",
        title: "Private integration setup successfully",
        description:
          "Your Notion connector will now use the private integration token.",
      });

      onSuccess(credentialId);
    } catch (err) {
      sendNotification({
        type: "error",
        title: "Failed to setup private integration",
        description: err instanceof Error ? err.message : "An error occurred",
      });
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Setup Notion Private Integration</DialogTitle>
        </DialogHeader>

        <div className="mx-4 mb-8 mt-5 space-y-6">
          {isLoadingWebhookConfig ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : (
            <>
              <div>
                <Page.SectionHeader title="Integration Token" />
                <p className="mb-4 mt-2 text-sm text-muted-foreground">
                  Paste your Notion integration token below.
                </p>
                <Input
                  type="text"
                  name="notion-integration-token"
                  value={integrationToken}
                  onChange={(e) => {
                    setIntegrationToken(e.target.value);
                    setError(null);
                  }}
                  isError={!!error}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-lpignore="true"
                  data-form-type="other"
                />
                {error && (
                  <p className="text-error-500 mt-2 text-sm">{error}</p>
                )}
              </div>

              {webhookConfig && (
                <>
                  <div>
                    <Page.SectionHeader title="Webhook URL" />
                    <p className="mb-4 mt-2 text-sm text-muted-foreground">
                      Use this URL to set up Notion webhooks.
                    </p>
                    <div className="relative w-full">
                      <Input
                        type="text"
                        name="notion-webhook-url"
                        value={webhookConfig.webhookUrl}
                        readOnly
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck="false"
                        data-lpignore="true"
                        data-form-type="other"
                        className="pr-12"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                        <Button
                          icon={
                            isCopiedWebhookUrl
                              ? ClipboardCheckIcon
                              : ClipboardIcon
                          }
                          onClick={() =>
                            copyWebhookUrl(webhookConfig.webhookUrl)
                          }
                          tooltip={
                            isCopiedWebhookUrl ? "Copied!" : "Copy to clipboard"
                          }
                          variant="ghost"
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Page.SectionHeader title="Verification Token" />
                    <p className="mb-4 mt-2 text-sm text-muted-foreground">
                      {webhookConfig.verificationToken
                        ? "Use this token to verify your webhook in Notion."
                        : "Set the webhook URL in your Notion integration and come back here to get the token."}
                    </p>
                    {webhookConfig.verificationToken && (
                      <div className="relative w-full">
                        <Input
                          type="text"
                          name="notion-verification-token"
                          value={webhookConfig.verificationToken}
                          readOnly
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck="false"
                          data-lpignore="true"
                          data-form-type="other"
                          className="pr-12"
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                          <Button
                            icon={
                              isCopiedToken ? ClipboardCheckIcon : ClipboardIcon
                            }
                            onClick={() =>
                              copyToken(webhookConfig.verificationToken!)
                            }
                            tooltip={
                              isCopiedToken ? "Copied!" : "Copy to clipboard"
                            }
                            variant="ghost"
                            size="sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: isLoading ? "Saving..." : "Save",
            onClick: handleSave,
            disabled: isLoading || !integrationToken.trim(),
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
