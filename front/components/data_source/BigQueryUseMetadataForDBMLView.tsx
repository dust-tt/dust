import { BigQueryLogo, ContextItem, SliderToggle } from "@dust-tt/sparkle";
import { useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { APIError, DataSourceType, WorkspaceType } from "@app/types";

export function BigQueryUseMetadataForDBMLView({
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
    configKey: "useMetadataForDBML",
  });
  const useMetadataForDBML = configValue === "true";

  const sendNotification = useSendNotification();
  const [loading, setLoading] = useState(false);

  const handleSetUseMetadataForDBML = async (useMetadataForDBML: boolean) => {
    setLoading(true);
    const res = await clientFetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/useMetadataForDBML`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ configValue: useMetadataForDBML.toString() }),
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
        title: "Failed to enable BigQuery use metadata for DBML",
        description: err.error.message,
      });
    }
    return true;
  };

  return (
    <ContextItem.List>
      <ContextItem
        title="Use descriptions"
        visual={<ContextItem.Visual visual={BigQueryLogo} />}
        action={
          <div className="relative">
            <SliderToggle
              size="xs"
              onClick={async () => {
                await handleSetUseMetadataForDBML(!useMetadataForDBML);
              }}
              selected={useMetadataForDBML}
              disabled={readOnly || !isAdmin || loading}
            />
          </div>
        }
      >
        <ContextItem.Description>
          <div className="text-muted-foreground dark:text-muted-foreground-night">
            Your tables and columns description set in BigQuery will be used to
            describe the schemas to Agents.
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}
