import {
  Button,
  ContentMessage,
  ContextItem,
  GongLogo,
  Input,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import { useState } from "react";

import { useConnectorConfig } from "@app/lib/swr/connectors";

function checkIsPositiveInteger(value: string) {
  return /^[0-9]+$/.test(value);
}

export function GongOptionComponent({
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
  const configKey = "gongRetentionPeriodDays";

  const { configValue, mutateConfig } = useConnectorConfig({
    owner,
    dataSource,
    configKey,
  });

  const [retentionPeriod, setRetentionPeriod] = useState<string>(
    configValue || ""
  );
  const [loading, setLoading] = useState(false);
  const sendNotification = useSendNotification();

  const handleSetNewConfig = async (newValue: string) => {
    // Validate that the value is either empty or a positive integer
    if (newValue !== "" && !checkIsPositiveInteger(newValue)) {
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
      await mutateConfig();
      setLoading(false);
      sendNotification({
        type: "success",
        title: "Gong configuration updated",
        description: "Retention period successfully updated.",
      });
    } else {
      setLoading(false);
      const err = await res.json();
      sendNotification({
        type: "error",
        title: "Failed to update Gong configuration",
        description: err.error?.message || "An unknown error occurred",
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
                  if (value === "" || checkIsPositiveInteger(value)) {
                    setRetentionPeriod(value);
                  }
                }}
                disabled={readOnly || !isAdmin || loading}
                className="w-32"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSetNewConfig(retentionPeriod)}
                disabled={readOnly || !isAdmin || loading}
                className="w-full"
                label="Save"
              />
            </div>
          }
        >
          <ContextItem.Description>
            <div className="text-element-700">
              Set the number of days to retain Gong transcripts.
              <br />
              Leave empty to disable retention (no limit).
              <br />
              Outdated transcripts will be deleted on a daily basis.
            </div>
          </ContextItem.Description>
        </ContextItem>
      </ContextItem.List>
    </div>
  );
}
