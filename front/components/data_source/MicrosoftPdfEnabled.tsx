import {
  ContextItem,
  MicrosoftLogo,
  SliderToggle,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { APIError, DataSourceType, WorkspaceType } from "@app/types";

export function MicrosoftPdfEnabled({
  owner,
  readOnly,
  isAdmin,
  dataSource,
}: {
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  dataSource: DataSourceType;
}) {
  const { configValue, mutateConfig } = useConnectorConfig({
    owner,
    dataSource,
    configKey: "pdfEnabled",
  });
  const pdfEnabled = configValue === "true";

  const sendNotification = useSendNotification();
  const [loading, setLoading] = useState(false);

  const handleSetPdfEnabled = async (pdfEnabled: boolean) => {
    setLoading(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/pdfEnabled`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ configValue: pdfEnabled.toString() }),
      }
    );
    if (res.ok) {
      await mutateConfig();
      setLoading(false);
    } else {
      setLoading(false);
      const err = (await res.json()) as { error: APIError };
      sendNotification({
        type: "error",
        title: "Failed to update PDF sync setting",
        description: err.error.message,
      });
    }
    return true;
  };

  return (
    <ContextItem.List>
      <ContextItem
        title="Enable PDF syncing"
        visual={<ContextItem.Visual visual={MicrosoftLogo} />}
        action={
          <div className="relative">
            <SliderToggle
              size="xs"
              onClick={async () => {
                await handleSetPdfEnabled(!pdfEnabled);
              }}
              selected={pdfEnabled}
              disabled={readOnly || !isAdmin || loading}
            />
          </div>
        }
      >
        <ContextItem.Description>
          <div className="text-muted-foreground dark:text-muted-foreground-night">
            When enabled, PDF documents from your Microsoft OneDrive and
            SharePoint will be synced and processed by Dust.
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}
