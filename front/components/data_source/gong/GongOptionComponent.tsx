import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { DataSourceType } from "@app/types/data_source";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  ContentMessage,
  ContextItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownTooltipTrigger,
  GongLogo,
  Input,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

// TODO(2025-03-17): share these variables between connectors and front.
const GONG_RETENTION_PERIOD_CONFIG_KEY = "gongRetentionPeriodDays";
const GONG_TRACKERS_CONFIG_KEY = "gongTrackersEnabled";
const GONG_ACCOUNTS_CONFIG_KEY = "gongAccountsEnabled";
const GONG_PERMISSION_PROFILE_ID_CONFIG_KEY = "gongPermissionProfileId";
const GONG_PERMISSION_PROFILES_CONFIG_KEY = "gongPermissionProfiles";

const PROFILE_NAME_MAX_LENGTH = 15;

interface GongPermissionProfile {
  id: string;
  name: string;
  permissionLevel: string;
  supported: boolean;
  reason: string | null;
}

function isGongPermissionProfile(
  value: unknown
): value is GongPermissionProfile {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "id" in value &&
    isString(value.id) &&
    "name" in value &&
    isString(value.name) &&
    "permissionLevel" in value &&
    isString(value.permissionLevel) &&
    "supported" in value &&
    typeof value.supported === "boolean" &&
    "reason" in value &&
    (value.reason === null || isString(value.reason))
  );
}

function checkIsNonNegativeInteger(value: string) {
  return /^[0-9]+$/.test(value);
}

interface PermissionProfileSelectorProps {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  disabled: boolean;
}

function PermissionProfileSelector({
  owner,
  dataSource,
  disabled,
}: PermissionProfileSelectorProps) {
  const sendNotification = useSendNotification();
  const [loading, setLoading] = useState(false);

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
  const [localProfileId, setLocalProfileId] = useState(
    permissionProfileIdConfigValue ?? ""
  );

  useEffect(() => {
    setLocalProfileId(permissionProfileIdConfigValue ?? "");
  }, [permissionProfileIdConfigValue]);

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

  const hasUnsavedChanges =
    permissionProfileIdConfigValue !== undefined &&
    localProfileId !== permissionProfileIdConfigValue;

  const displayedProfile = useMemo(() => {
    if (!localProfileId) {
      return null;
    }
    return permissionProfiles.find((p) => p.id === localProfileId) ?? null;
  }, [localProfileId, permissionProfiles]);

  const handleSave = async () => {
    setLoading(true);
    // The config API only accepts strings, so "" means "no filter" (normalized
    // to null on the connector side).
    const res = await clientFetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${GONG_PERMISSION_PROFILE_ID_CONFIG_KEY}`,
      {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ configValue: localProfileId }),
      }
    );
    if (res.ok) {
      await mutatePermissionProfileIdConfig();
      sendNotification({
        type: "success",
        title: "Gong configuration updated",
        description: "Participant filter successfully updated.",
      });
    } else {
      const err = await res.json();
      sendNotification({
        type: "error",
        title: "Failed to update Gong configuration",
        description: normalizeError(err).message || "An unknown error occurred",
      });
    }
    setLoading(false);
  };

  return (
    <ContextItem
      title="Participant Filter"
      visual={<ContextItem.Visual visual={GongLogo} />}
      action={
        <div className="flex flex-row space-x-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                label={
                  displayedProfile
                    ? displayedProfile.name.length > PROFILE_NAME_MAX_LENGTH
                      ? displayedProfile.name.slice(
                          0,
                          PROFILE_NAME_MAX_LENGTH
                        ) + "..."
                      : displayedProfile.name
                    : "All participants"
                }
                isSelect
                disabled={disabled || loading}
                tooltip={displayedProfile?.name}
                className="w-40 overflow-hidden px-4"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                label="All participants"
                onClick={() => setLocalProfileId("")}
              />
              {permissionProfiles.map((profile) => {
                const item = (
                  <DropdownMenuItem
                    key={profile.id}
                    label={profile.name}
                    disabled={!profile.supported}
                    onClick={() => setLocalProfileId(profile.id)}
                  />
                );
                if (profile.reason) {
                  return (
                    <DropdownTooltipTrigger
                      key={profile.id}
                      description={profile.reason}
                    >
                      {item}
                    </DropdownTooltipTrigger>
                  );
                }
                return item;
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={disabled || loading || !hasUnsavedChanges}
            label={loading ? "Saving..." : "Save"}
          />
        </div>
      }
    >
      <ContextItem.Description>
        <div className="text-muted-foreground dark:text-muted-foreground-night">
          Filter calls by participant group. Only calls where at least one
          participant is assigned to the selected profile will be synced.
          Changing the filter only affects future syncs.
        </div>
      </ContextItem.Description>
    </ContextItem>
  );
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

  const [retentionPeriod, setRetentionPeriod] = useState<string>(
    retentionPeriodConfigValue ?? ""
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
        <PermissionProfileSelector
          owner={owner}
          dataSource={dataSource}
          disabled={readOnly || !isAdmin || loading}
        />

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
