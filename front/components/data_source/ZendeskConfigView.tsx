import {
  Button,
  ContextItem,
  Input,
  SliderToggle,
  ZendeskLogo,
  ZendeskWhiteLogo,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { ZendeskCustomFieldFilters } from "@app/components/data_source/ZendeskCustomTagFilters";
import { ZendeskOrganizationTagFilters } from "@app/components/data_source/ZendeskOrganizationTagFilters";
import { ZendeskTicketTagFilters } from "@app/components/data_source/ZendeskTicketTagFilters";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { ZENDESK_CONFIG_KEYS } from "@app/lib/constants/zendesk";
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

  const {
    configValue: syncUnresolvedTicketsConfigValue,
    mutateConfig: mutateSyncUnresolvedTicketsConfig,
  } = useConnectorConfig({
    owner,
    dataSource,
    configKey: ZENDESK_CONFIG_KEYS.SYNC_UNRESOLVED_TICKETS,
  });
  const {
    configValue: hideCustomerDetailsConfigValue,
    mutateConfig: mutateHideCustomerDetailsConfig,
  } = useConnectorConfig({
    owner,
    dataSource,
    configKey: ZENDESK_CONFIG_KEYS.HIDE_CUSTOMER_DETAILS,
  });
  const {
    configValue: retentionPeriodDays,
    mutateConfig: mutateRetentionPeriodConfig,
  } = useConnectorConfig({
    owner,
    dataSource,
    configKey: ZENDESK_CONFIG_KEYS.RETENTION_PERIOD,
  });

  const syncUnresolvedTicketsEnabled =
    syncUnresolvedTicketsConfigValue === "true";
  const hideCustomerDetailsEnabled = hideCustomerDetailsConfigValue === "true";

  const sendNotification = useSendNotification();
  const [loading, setLoading] = useState(false);
  const [retentionInput, setRetentionInput] = useState(
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
      if (configKey === ZENDESK_CONFIG_KEYS.RETENTION_PERIOD) {
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
      await handleSetNewConfig(ZENDESK_CONFIG_KEYS.RETENTION_PERIOD, numValue);
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
                  ZENDESK_CONFIG_KEYS.SYNC_UNRESOLVED_TICKETS,
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
            If activated, Dust will also sync the unresolved tickets.
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
                  ZENDESK_CONFIG_KEYS.HIDE_CUSTOMER_DETAILS,
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
      >
        <ContextItem.Description>
          <div className="mb-4 flex items-start justify-between gap-4 text-muted-foreground dark:text-muted-foreground-night">
            Set the retention period (in days), tickets older than the retention
            period will not be synced with Dust.
            <div className="flex items-center gap-2">
              <Input
                value={retentionInput}
                type="number"
                onChange={(e) => setRetentionInput(e.target.value)}
                disabled={readOnly || !isAdmin || loading}
                placeholder={
                  retentionPeriodDays
                    ? `${retentionPeriodDays} days`
                    : undefined
                }
                className="w-24"
              />
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
          </div>
        </ContextItem.Description>
      </ContextItem>
      <ZendeskTicketTagFilters
        owner={owner}
        readOnly={readOnly}
        isAdmin={isAdmin}
        dataSource={dataSource}
      />
      <ZendeskOrganizationTagFilters
        owner={owner}
        readOnly={readOnly}
        isAdmin={isAdmin}
        dataSource={dataSource}
      />
      <ZendeskCustomFieldFilters
        owner={owner}
        readOnly={readOnly}
        isAdmin={isAdmin}
        dataSource={dataSource}
      />
    </ContextItem.List>
  );
}
