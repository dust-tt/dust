import { ContextItem, IntercomLogo, SliderToggle } from "@dust-tt/sparkle";
import { useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { APIError, DataSourceType, WorkspaceType } from "@app/types";

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
  const [loading, setLoading] = useState(false);

  const handleSetNewConfig = async (configValue: boolean) => {
    setLoading(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${configKey}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ configValue: configValue.toString() }),
      }
    );
    if (res.ok) {
      await mutateSyncNotesConfig();
      setLoading(false);
    } else {
      setLoading(false);
      const err = (await res.json()) as { error: APIError };
      sendNotification({
        type: "error",
        title: "Failed to edit Intercom Configuration",
        description: err.error.message,
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
