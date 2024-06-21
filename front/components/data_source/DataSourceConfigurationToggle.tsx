import { SliderToggle } from "@dust-tt/sparkle";
import type { APIError, DataSourceType, WorkspaceType } from "@dust-tt/types";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useConnectorConfig } from "@app/lib/swr";

export function DataSourceConfigurationToggle({
  owner,
  disabled,
  configKey,
  dataSource,
  onClick,
  errorMessage,
}: {
  owner: WorkspaceType;
  disabled: boolean;
  configKey: string;
  dataSource: DataSourceType;
  onClick?: () => boolean;
  errorMessage: string;
}) {
  const { configValue, mutateConfig } = useConnectorConfig({
    owner,
    dataSource,
    configKey,
  });
  const isSettingEnabled = configValue === "true";

  const sendNotification = useContext(SendNotificationsContext);
  const [loading, setLoading] = useState(false);

  const handleSetNewConfig = async (configValue: boolean) => {
    setLoading(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/config/${configKey}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ configValue: configValue.toString() }),
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
        title: errorMessage,
        description: err.error.message,
      });
    }
    return true;
  };

  return (
    <SliderToggle
      size="xs"
      onClick={async () => {
        if (!onClick || onClick()) {
          await handleSetNewConfig(!isSettingEnabled);
        }
      }}
      selected={isSettingEnabled}
      disabled={disabled || loading}
    />
  );
}
