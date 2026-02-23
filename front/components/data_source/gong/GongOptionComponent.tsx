import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { DataSourceType } from "@app/types/data_source";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  ContentMessage,
  ContextItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GongLogo,
  Input,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

// TODO(2025-03-17): share these variables between connectors and front.
const GONG_RETENTION_PERIOD_CONFIG_KEY = "gongRetentionPeriodDays";
const GONG_TRACKERS_CONFIG_KEY = "gongTrackersEnabled";
const GONG_ACCOUNTS_CONFIG_KEY = "gongAccountsEnabled";
const GONG_PERMISSION_PROFILE_ID_CONFIG_KEY = "gongPermissionProfileId";
const GONG_PERMISSION_PROFILES_CONFIG_KEY = "gongPermissionProfiles";

interface GongPermissionProfile {
  id: string;
  name: string;
}

function isGongPermissionProfile(
  value: unknown
): value is GongPermissionProfile {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.id === "string" && typeof obj.name === "string";
}

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

  const {
    configValue: accountsConfigValue,
    mutateConfig: mutateAccountsConfig,
  } = useConnectorConfig({
    owner,
    dataSource,
    configKey: GONG_ACCOUNTS_CONFIG_KEY,
  });
  const accountsEnabled = accountsConfigValue === "true";

  const {
    configValue: permissionProfileIdConfigValue,
    mutateConfig: mutatePermissionProfileIdConfig,
  } = useConnectorConfig({
    owner,
    dataSource,
    configKey: GONG_PERMISSION_PROFILE_ID_CONFIG_KEY,
  });

  const { configValue: permissionProfilesConfigValue } = useConnectorConfig({
    owner,
    dataSource,
    configKey: GONG_PERMISSION_PROFILES_CONFIG_KEY,
  });

  const permissionProfiles = useMemo<GongPermissionProfile[]>(() => {
    if (!permissionProfilesConfigValue) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(permissionProfilesConfigValue);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(isGongPermissionProfile);
    } catch {
      return [];
    }
  }, [permissionProfilesConfigValue]);

  const selectedProfile = useMemo(() => {
    if (!permissionProfileIdConfigValue) {
      return null;
    }
    return (
      permissionProfiles.find((p) => p.id === permissionProfileIdConfigValue) ??
      null
    );
  }, [permissionProfileIdConfigValue, permissionProfiles]);

  const [retentionPeriod, setRetentionPeriod] = useState<string>(
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    retentionPeriodConfigValue || ""
  );

  const [loading, setLoading] = useState(false);
  const sendNotification = useSendNotification();

  // TODO: fix the auto-save pattern here and replace with an actual save on the sheet.
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
    const res = await clientFetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${configKey}`,
      {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ configValue: newValue }),
      }
    );
    if (res.ok) {
      let description: string;
      switch (configKey) {
        case GONG_RETENTION_PERIOD_CONFIG_KEY:
          await mutateRetentionPeriodConfig();
          description = "Retention period successfully updated.";
          break;
        case GONG_TRACKERS_CONFIG_KEY:
          await mutateTrackersConfig();
          description = "Trackers synchronization successfully updated.";
          break;
        case GONG_ACCOUNTS_CONFIG_KEY:
          await mutateAccountsConfig();
          description = "Accounts synchronization successfully updated.";
          break;
        case GONG_PERMISSION_PROFILE_ID_CONFIG_KEY:
          await mutatePermissionProfileIdConfig();
          description = "Permission profile successfully updated.";
          break;
        default:
          description = "Configuration successfully updated.";
      }
      setLoading(false);
      sendNotification({
        type: "success",
        title: "Gong configuration updated",
        description,
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
          title="Permission Profile"
          visual={<ContextItem.Visual visual={GongLogo} />}
          action={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  label={
                    selectedProfile
                      ? selectedProfile.name.length > 20
                        ? selectedProfile.name.slice(0, 20) + "..."
                        : selectedProfile.name
                      : "All calls"
                  }
                  isSelect
                  disabled={readOnly || !isAdmin || loading}
                  tooltip={selectedProfile?.name}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  label="All calls"
                  onClick={() =>
                    handleConfigUpdate(
                      GONG_PERMISSION_PROFILE_ID_CONFIG_KEY,
                      ""
                    )
                  }
                />
                {permissionProfiles.map((profile) => (
                  <DropdownMenuItem
                    key={profile.id}
                    label={profile.name}
                    onClick={() =>
                      handleConfigUpdate(
                        GONG_PERMISSION_PROFILE_ID_CONFIG_KEY,
                        profile.id
                      )
                    }
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        >
          <ContextItem.Description>
            <div className="text-muted-foreground dark:text-muted-foreground-night">
              Only calls with at least one participant from the profile&apos;s
              user list will be synced. Changing the profile only affects future
              syncs.
            </div>
          </ContextItem.Description>
        </ContextItem>

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

        <ContextItem
          title="Sync Account metadata"
          visual={<ContextItem.Visual visual={GongLogo} />}
          action={
            <div className="relative">
              <SliderToggle
                size="xs"
                onClick={async () => {
                  await handleConfigUpdate(
                    GONG_ACCOUNTS_CONFIG_KEY,
                    (!accountsEnabled).toString()
                  );
                }}
                selected={accountsEnabled}
                disabled={readOnly || !isAdmin || loading}
              />
            </div>
          }
        >
          <ContextItem.Description>
            <div className="text-muted-foreground dark:text-muted-foreground-night">
              If activated, Dust will sync the account names from CRM context
              associated to each call transcript.
              <br />
              Only new transcripts will be affected, please contact us at
              support@dust.tt if you need to update the existing transcripts.
            </div>
          </ContextItem.Description>
        </ContextItem>
      </ContextItem.List>
    </div>
  );
}
