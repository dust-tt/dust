import {
  Button,
  ContextItem,
  Input,
  SliderToggle,
  ZendeskLogo,
  ZendeskWhiteLogo,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useSendNotification } from "@app/hooks/useNotification";
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
  const retentionPeriodConfigKey = "zendeskRetentionPeriodDays";

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
  const {
    configValue: retentionPeriodConfigValue,
    mutateConfig: mutateRetentionPeriodConfig,
  } = useConnectorConfig({
    owner,
    dataSource,
    configKey: retentionPeriodConfigKey,
  });

  const syncUnresolvedTicketsEnabled =
    syncUnresolvedTicketsConfigValue === "true";
  const hideCustomerDetailsEnabled = hideCustomerDetailsConfigValue === "true";

  const retentionPeriodDays = retentionPeriodConfigValue;

  const sendNotification = useSendNotification();
  const [loading, setLoading] = useState(false);
  const [retentionInput, setRetentionInput] = useState(
    retentionPeriodDays?.toString() || ""
  );

  const handleSetNewConfig = async (
    configKey: string,
    configValue: boolean | number
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
      await mutateRetentionPeriodConfig();
      setLoading(false);

      // Show a notif only for the retention period (the others are toggles).
      if (configKey === retentionPeriodConfigKey) {
        sendNotification({
          type: "success",
          title: "Retention period updated",
          description: `The retention period has been updated to ${configValue} days.`,
        });
      }
    } else {
      setLoading(false);
      const err = await res.json();

      sendNotification({
        type: "info",
        title: "Failed to edit Zendesk configuration",
        description:
          err.error?.connectors_error.message || "An unknown error occurred",
      });
    }
    return true;
  };

  const handleRetentionPeriodSave = async () => {
    const value = retentionInput.trim();

    if (value !== "") {
      const numValue = parseInt(value, 10);
      if (isNaN(numValue) || numValue <= 0) {
        sendNotification({
          type: "info",
          title: "Invalid retention period",
          description: "Retention period must be a positive integer.",
        });
        return;
      }
      await handleSetNewConfig(retentionPeriodConfigKey, numValue);
    }
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

      <ContextItem
        title="Data Retention Period"
        visual={
          <ContextItem.Visual
            visual={isDark ? ZendeskWhiteLogo : ZendeskLogo}
          />
        }
        action={
          <div className="flex items-center gap-2">
            <Input
              value={retentionInput}
              type="number"
              onChange={(e) => setRetentionInput(e.target.value)}
              disabled={readOnly || !isAdmin || loading}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">days</span>
            <Button
              size="sm"
              onClick={handleRetentionPeriodSave}
              disabled={
                readOnly ||
                !isAdmin ||
                loading ||
                retentionInput === retentionPeriodDays?.toString()
              }
              label="Save"
            />
          </div>
        }
      >
        <ContextItem.Description>
          <div className="text-muted-foreground dark:text-muted-foreground-night">
            Set the duration of the retention period: tickets older than the
            retention period will be cleaned on a daily basis.
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}
