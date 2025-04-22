import {
  ContextItem,
  SliderToggle,
  useSendNotification,
  ZendeskLogo,
  ZendeskWhiteLogo,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { DataSourceType, WorkspaceType } from "@app/types";

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
  const { isDark } = useTheme();

  const unresolvedTicketsConfigKey = "zendeskSyncUnresolvedTicketsEnabled";
  const hideCustomerDetailsConfigKey = "zendeskHideCustomerDetails";

  const {
    configValue: syncUnresolvedTicketsConfigValue,
    mutateConfig: mutateSyncUnresolvedTicketsConfig,
  } = useConnectorConfig({
    owner,
    dataSource,
    configKey: unresolvedTicketsConfigKey,
  });
  const {
    configValue: hideCustomerDetailsConfigValue,
    mutateConfig: mutateHideCustomerDetailsConfig,
  } = useConnectorConfig({
    owner,
    dataSource,
    configKey: hideCustomerDetailsConfigKey,
  });

  const syncUnresolvedTicketsEnabled =
    syncUnresolvedTicketsConfigValue === "true";
  const hideCustomerDetailsEnabled = hideCustomerDetailsConfigValue === "true";

  const sendNotification = useSendNotification();
  const [loading, setLoading] = useState(false);

  const handleSetNewConfig = async (
    configKey: string,
    configValue: boolean
  ) => {
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
      await mutateSyncUnresolvedTicketsConfig();
      await mutateHideCustomerDetailsConfig();
      setLoading(false);
    } else {
      setLoading(false);
      const err = await res.json();
      sendNotification({
        type: "error",
        title: "Failed to edit Zendesk configuration",
        description: err.error?.message || "An unknown error occurred",
      });
    }
    return true;
  };

  return (
    <ContextItem.List>
      <ContextItem
        title="Sync unresolved tickets"
        visual={
          <ContextItem.Visual
            visual={isDark ? ZendeskWhiteLogo : ZendeskLogo}
          />
        }
        action={
          <div className="relative">
            <SliderToggle
              size="xs"
              onClick={async () => {
                await handleSetNewConfig(
                  unresolvedTicketsConfigKey,
                  !syncUnresolvedTicketsEnabled
                );
              }}
              selected={syncUnresolvedTicketsEnabled}
              disabled={readOnly || !isAdmin || loading}
            />
          </div>
        }
      >
        <ContextItem.Description>
          <div className="text-muted-foreground dark:text-muted-foreground-night">
            If activated, Dust will also sync the unresolved tickets. This may
            significantly increase the number of synced tickets, potentially
            negatively affecting the response quality due to the added noise.
          </div>
        </ContextItem.Description>
      </ContextItem>

      <ContextItem
        title="Hide Customer Information"
        visual={
          <ContextItem.Visual
            visual={isDark ? ZendeskWhiteLogo : ZendeskLogo}
          />
        }
        action={
          <div className="relative">
            <SliderToggle
              size="xs"
              onClick={async () => {
                await handleSetNewConfig(
                  hideCustomerDetailsConfigKey,
                  !hideCustomerDetailsEnabled
                );
              }}
              selected={hideCustomerDetailsEnabled}
              disabled={readOnly || !isAdmin || loading}
            />
          </div>
        }
      >
        <ContextItem.Description>
          <div className="text-muted-foreground dark:text-muted-foreground-night">
            Enable this option to prevent customer names and email addresses
            from being synced with Dust. This does not impact data within
            tickets, only the metadata attached to tickets.
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}
