import {
  Button,
  ContentMessage,
  ContextItem,
  GongLogo,
  Input,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { DataSourceType, WorkspaceType } from "@app/types";
import { normalizeError } from "@app/types";

// TODO(2025-03-17): share these variables between connectors and front.
const GONG_RETENTION_PERIOD_CONFIG_KEY = "gongRetentionPeriodDays";
const GONG_TRACKERS_CONFIG_KEY = "gongTrackersEnabled";

function checkIsNonNegativeInteger(value: string) {
  return /^[0-9]+$/.test(value);
}

interface GongOptionComponentProps {
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  dataSource: DataSourceType;
}

export function GongOptionComponent({
  owner,
  readOnly,
  isAdmin,
  dataSource,
}: GongOptionComponentProps) {
  const {
    configValue: retentionPeriodConfigValue,
    mutateConfig: mutateRetentionPeriodConfig,
  } = useConnectorConfig({
    owner,
    dataSource,
    configKey: GONG_RETENTION_PERIOD_CONFIG_KEY,
  });
  const {
    configValue: trackersConfigValue,
    mutateConfig: mutateTrackersConfig,
  } = useConnectorConfig({
    owner,
    dataSource,
    configKey: GONG_TRACKERS_CONFIG_KEY,
  });
  const trackersEnabled = trackersConfigValue === "true";

  const [retentionPeriod, setRetentionPeriod] = useState<string>(
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    retentionPeriodConfigValue || ""
  );

  const [loading, setLoading] = useState(false);
  const sendNotification = useSendNotification();

  const handleConfigUpdate = async (configKey: string, newValue: string) => {
    // Validate that the value is either empty or a positive integer
    if (
      configKey === GONG_RETENTION_PERIOD_CONFIG_KEY &&
      newValue.trim() !== "" &&
      !checkIsNonNegativeInteger(newValue)
    ) {
      sendNotification({
        type: "error",
        title: "Invalid retention period",
        description:
          "Retention period must be a positive integer or empty for no limit.",
      });
      return;
    }

    setLoading(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${configKey}`,
      {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ configValue: newValue }),
      }
    );
    if (res.ok) {
      if (configKey === GONG_RETENTION_PERIOD_CONFIG_KEY) {
        await mutateRetentionPeriodConfig();
      } else if (configKey === GONG_TRACKERS_CONFIG_KEY) {
        await mutateTrackersConfig();
      }
      setLoading(false);
      sendNotification({
        type: "success",
        title: "Gong configuration updated",
        description:
          configKey === GONG_RETENTION_PERIOD_CONFIG_KEY
            ? "Retention period successfully updated."
            : "Trackers synchronization successfully enabled.",
      });
    } else {
      setLoading(false);
      const err = await res.json();
      sendNotification({
        type: "error",
        title: "Failed to update Gong configuration",
        description: normalizeError(err).message || "An unknown error occurred",
      });
    }
  };

  return (
    <div className="flex flex-col space-y-4 py-2">
      <ContentMessage title="All Gong data will sync automatically" size="lg">
        All your Gong resources will sync automatically. Selecting items
        individually is not available.
      </ContentMessage>

      <ContextItem.List>
        <ContextItem
          title="Retention Period"
          visual={<ContextItem.Visual visual={GongLogo} />}
          action={
            <div className="flex flex-row space-x-3 pt-6">
              <Input
                name="retentionPeriod"
                placeholder="unlimited"
                value={retentionPeriod}
                onChange={(e) => {
                  // Only allow positive integer values.
                  const value = e.target.value;
                  if (value === "" || checkIsNonNegativeInteger(value)) {
                    setRetentionPeriod(value);
                  }
                }}
                disabled={readOnly || !isAdmin || loading}
                className="w-32"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  handleConfigUpdate(
                    GONG_RETENTION_PERIOD_CONFIG_KEY,
                    retentionPeriod
                  )
                }
                disabled={readOnly || !isAdmin || loading}
                label="Save"
              />
            </div>
          }
        >
          <ContextItem.Description>
            <div className="text-muted-foreground dark:text-muted-foreground-night">
              Set the number of days to retain Gong transcripts.
              <br />
              Leave empty to disable retention (no limit).
              <br />
              Outdated transcripts will be deleted on a daily basis.
            </div>
          </ContextItem.Description>
        </ContextItem>

        <ContextItem
          title="Enable Trackers (Keyword and Smart)"
          visual={<ContextItem.Visual visual={GongLogo} />}
          action={
            <div className="relative">
              <SliderToggle
                size="xs"
                onClick={async () => {
                  await handleConfigUpdate(
                    GONG_TRACKERS_CONFIG_KEY,
                    (!trackersEnabled).toString()
                  );
                }}
                selected={trackersEnabled}
                disabled={readOnly || !isAdmin || loading}
              />
            </div>
          }
        >
          <ContextItem.Description>
            <div className="text-muted-foreground dark:text-muted-foreground-night">
              If activated, Dust will sync the list of keyword and smart
              trackers associated to each call transcript.
              <br />
              {/* The procedure to follow to backfill existing transcripts is a full sync. */}
              Only new transcripts will be affected, please contact us at
              support@dust.tt if you need to update the existing transcripts.
            </div>
          </ContextItem.Description>
        </ContextItem>
      </ContextItem.List>
    </div>
  );
}
