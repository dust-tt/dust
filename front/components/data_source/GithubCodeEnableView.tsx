import { ContextItem, GithubLogo, SliderToggle } from "@dust-tt/sparkle";
import type { APIError, DataSourceType, WorkspaceType } from "@dust-tt/types";
import { useContext, useState } from "react";
import * as React from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useConnectorConfig } from "@app/lib/swr/connectors";

export function GithubCodeEnableView({
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
    configKey: "codeSyncEnabled",
  });
  const codeSyncEnabled = configValue === "true";

  const sendNotification = useContext(SendNotificationsContext);
  const [loading, setLoading] = useState(false);

  const handleSetCodeSyncEnabled = async (codeSyncEnabled: boolean) => {
    setLoading(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/config/codeSyncEnabled`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ configValue: codeSyncEnabled.toString() }),
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
        title: "Failed to enable GitHub code sync",
        description: err.error.message,
      });
    }
    return true;
  };

  return (
    <ContextItem.List>
      <ContextItem
        title="Code Synchronization"
        visual={<ContextItem.Visual visual={GithubLogo} />}
        action={
          <div className="relative">
            <SliderToggle
              size="xs"
              onClick={async () => {
                await handleSetCodeSyncEnabled(!codeSyncEnabled);
              }}
              selected={codeSyncEnabled}
              disabled={readOnly || !isAdmin || loading}
            />
          </div>
        }
      >
        <ContextItem.Description>
          <div className="text-element-700">
            Your GitHub repositories code is synced with Dust every 8h.
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}
