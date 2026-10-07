import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { DataSourceType } from "@app/types/data_source";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, GithubLogo, SliderToggle } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const { configValue, mutateConfig } = useConnectorConfig({
    owner,
    dataSource,
    configKey: "codeSyncEnabled",
  });
  const codeSyncEnabled = configValue === "true";

  const [loading, setLoading] = useState(false);

  const handleSetCodeSyncEnabled = async (codeSyncEnabled: boolean) => {
    setLoading(true);
    const res = await clientFetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/codeSyncEnabled`,
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
      const err: unknown = await res.json();
      sendApiErrorNotification({
        title: t`Failed to enable GitHub code sync`,
        error: err,
      });
    }
    return true;
  };

  return (
    <ContextItem.List>
      <ContextItem
        title={t`Code synchronization`}
        visual={<ContextItem.Visual visual={GithubLogo} />}
        action={
          <div className="relative">
            <SliderToggle
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
          <div className="text-muted-foreground">
            <Trans>
              Your GitHub repositories code is synced with Dust every 8h.
            </Trans>
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}
