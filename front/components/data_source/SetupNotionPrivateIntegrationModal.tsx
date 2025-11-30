import type { NotificationType } from "@dust-tt/sparkle";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Page,
} from "@dust-tt/sparkle";
import { useState } from "react";

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

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/w/${owner.sId}/credentials`, {
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
      const configRes = await fetch(
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

        <div className="mx-4 mt-5">
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
            {error && <p className="text-error-500 mt-2 text-sm">{error}</p>}
          </div>
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
