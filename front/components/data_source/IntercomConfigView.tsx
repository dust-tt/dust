import { useSendNotification } from "@app/hooks/useNotification";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import { useFetcher } from "@app/lib/swr/swr";
import type { DataSourceType } from "@app/types/data_source";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, IntercomLogo, SliderToggle } from "@dust-tt/sparkle";
import { useState } from "react";

export function IntercomConfigView({
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
  const configKey = "intercomConversationsNotesSyncEnabled";
  const { configValue: syncNotesConfig, mutateConfig: mutateSyncNotesConfig } =
    useConnectorConfig({
      owner,
      dataSource,
      configKey,
    });
  const isSyncNotesEnabled = syncNotesConfig === "true";

  const sendNotification = useSendNotification();
  const { fetcherWithBody } = useFetcher();
  const [loading, setLoading] = useState(false);

  const handleSetNewConfig = async (configValue: boolean) => {
    setLoading(true);
    try {
      await fetcherWithBody([
        `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${configKey}`,
        { configValue: configValue.toString() },
        "POST",
      ]);
      await mutateSyncNotesConfig();
      setLoading(false);
    } catch (e: any) {
      setLoading(false);
      sendNotification({
        type: "error",
        title: "Failed to edit Intercom Configuration",
        description: e?.error?.message ?? "An error occurred",
      });
    }
    return true;
  };

  return (
    <ContextItem.List>
      <ContextItem
        title="Sync Intercom Notes from conversations"
        visual={<ContextItem.Visual visual={IntercomLogo} />}
        action={
          <div className="relative">
            <SliderToggle
              size="xs"
              onClick={async () => {
                await handleSetNewConfig(!isSyncNotesEnabled);
              }}
              selected={isSyncNotesEnabled}
              disabled={readOnly || !isAdmin || loading}
            />
          </div>
        }
      >
        <ContextItem.Description>
          <div className="text-muted-foreground dark:text-muted-foreground-night">
            If activated, Dust will also sync the notes from the conversations
            you've selected.
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}
