import {
  ContextItem,
  IntercomLogo,
  SliderToggle,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { APIError, DataSourceType, WorkspaceType } from "@dust-tt/types";
import { useState } from "react";

import { useConnectorConfig } from "@app/lib/swr/connectors";

export function ZendeskConfigView({
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
  const configKey = "zendeskSyncUnresolvedTicketsEnabled";

  const { configValue, mutateConfig } = useConnectorConfig({
    owner,
    dataSource,
    configKey,
  });
  const syncUnresolvedTicketsEnabled = configValue === "true";

  const sendNotification = useSendNotification();
  const [loading, setLoading] = useState(false);

  const handleSetNewConfig = async (configValue: boolean) => {
    setLoading(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${configKey}`,
      {
        headers: { "Content-Type": "application/json" },
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
        title: "Failed to edit Zendesk configuration",
        description: err.error.message,
      });
    }
    return true;
  };

  return (
    <ContextItem.List>
      <ContextItem
        title="Sync unresolved tickets"
        visual={<ContextItem.Visual visual={IntercomLogo} />}
        action={
          <div className="relative">
            <SliderToggle
              size="xs"
              onClick={async () => {
                await handleSetNewConfig(!syncUnresolvedTicketsEnabled);
              }}
              selected={syncUnresolvedTicketsEnabled}
              disabled={readOnly || !isAdmin || loading}
            />
          </div>
        }
      >
        <ContextItem.Description>
          <div className="text-element-700">
            If activated, Dust will also sync the unresolved tickets.
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}
