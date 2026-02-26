import { useSendNotification } from "@app/hooks/useNotification";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import { useFetcher } from "@app/lib/swr/swr";
import type { DataSourceType } from "@app/types/data_source";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, GithubLogo, SliderToggle } from "@dust-tt/sparkle";
import { useState } from "react";

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

  const sendNotification = useSendNotification();
  const { fetcherWithBody } = useFetcher();
  const [loading, setLoading] = useState(false);

  const handleSetCodeSyncEnabled = async (codeSyncEnabled: boolean) => {
    setLoading(true);
    try {
      await fetcherWithBody([
        `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/codeSyncEnabled`,
        { configValue: codeSyncEnabled.toString() },
        "POST",
      ]);
      await mutateConfig();
      setLoading(false);
    } catch (e: any) {
      setLoading(false);
      sendNotification({
        type: "error",
        title: "Failed to enable GitHub code sync",
        description: e?.error?.message ?? "An error occurred",
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
          <div className="text-muted-foreground dark:text-muted-foreground-night">
            Your GitHub repositories code is synced with Dust every 8h.
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}
