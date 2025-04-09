import {
  ContextItem,
  SalesforceLogo,
  SliderToggle,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useConnectorConfig } from "@app/lib/swr/connectors";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { DataSourceType, WorkspaceType } from "@app/types";

const PERSONAL_CONNECTIONS_CONFIG_KEY = "usePersonalConnections";

interface SalesforceOptionComponentProps {
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  dataSource: DataSourceType;
}

export function SalesforceOptionComponent({
  owner,
  readOnly,
  isAdmin,
  dataSource,
}: SalesforceOptionComponentProps) {
  const { configValue, mutateConfig } = useConnectorConfig({
    owner,
    dataSource,
    configKey: PERSONAL_CONNECTIONS_CONFIG_KEY,
  });

  const [loading, setLoading] = useState(false);
  const sendNotification = useSendNotification();

  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const isPersonalConnectionsEnabled = featureFlags.includes(
    "labs_personal_connections"
  );

  if (!isPersonalConnectionsEnabled) {
    return false;
  }

  const handleSetNewConfig = async (newValue: boolean) => {
    setLoading(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${PERSONAL_CONNECTIONS_CONFIG_KEY}`,
      {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ configValue: newValue.toString() }),
      }
    );
    if (res.ok) {
      await mutateConfig();
      setLoading(false);
      sendNotification({
        type: "success",
        title: "Salesforce configuration updated",
        description: `Personal connections ${newValue ? "enabled" : "disabled"}.`,
      });
    } else {
      setLoading(false);
      const err = await res.json();
      sendNotification({
        type: "error",
        title: "Failed to update Salesforce configuration",
        description: err.error?.message || "An unknown error occurred",
      });
    }
  };

  return (
    <div className="flex flex-col space-y-4 py-2">
      <ContextItem.List>
        <ContextItem
          title="Personal connections"
          visual={<ContextItem.Visual visual={SalesforceLogo} />}
          action={
            <SliderToggle
              size="sm"
              selected={configValue === "true"}
              onClick={() => handleSetNewConfig(configValue !== "true")}
              disabled={readOnly || !isAdmin || loading}
            />
          }
        >
          <ContextItem.Description>
            <div className="text-muted-foreground dark:text-muted-foreground-night">
              Use personal connections to query your Salesforce data.
            </div>
          </ContextItem.Description>
        </ContextItem>
      </ContextItem.List>
    </div>
  );
}
