import { useSendNotification } from "@app/hooks/useNotification";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import { useFetcher } from "@app/lib/swr/swr";
import type { DataSourceType } from "@app/types/data_source";
import type { WorkspaceType } from "@app/types/user";
import { BigQueryLogo, ContextItem, SliderToggle } from "@dust-tt/sparkle";
import { useState } from "react";

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
  const { fetcherWithBody } = useFetcher();
  const [loading, setLoading] = useState(false);

  const handleSetUseMetadataForDBML = async (useMetadataForDBML: boolean) => {
    setLoading(true);
    try {
      await fetcherWithBody([
        `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/useMetadataForDBML`,
        { configValue: useMetadataForDBML.toString() },
        "POST",
      ]);
      await mutateConfig();
      setLoading(false);
    } catch (e: any) {
      setLoading(false);
      sendNotification({
        type: "error",
        title: "Failed to enable BigQuery use metadata for DBML",
        description: e?.error?.message ?? "An error occurred",
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
