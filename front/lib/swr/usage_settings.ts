import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetCreditUsageConfigurationResponseBody } from "@app/pages/api/w/[wId]/credits/usage-configuration";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback, useSyncExternalStore } from "react";
import type { Fetcher } from "swr";

export interface UsageSettings {
  allowUpgradeRequest: boolean;
  autoUpgradeFreeToPro: boolean;
  defaultUsageLimitCredits: number;
}

export interface UsageNotifications {
  creditUsageAlertPercent: number;
  creditCapWarning: boolean;
  upgradeRequestEmail: boolean;
}

const DEFAULT_USAGE_SETTINGS: UsageSettings = {
  allowUpgradeRequest: false,
  autoUpgradeFreeToPro: false,
  defaultUsageLimitCredits: 1000,
};

const DEFAULT_USAGE_NOTIFICATIONS: UsageNotifications = {
  creditUsageAlertPercent: 80,
  creditCapWarning: true,
  upgradeRequestEmail: true,
};

const usageSettingsStore = new Map<string, UsageSettings>();
const usageNotificationsStore = new Map<string, UsageNotifications>();
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function notify() {
  listeners.forEach((listener) => listener());
}

function getUsageSettings(workspaceId: string): UsageSettings {
  return usageSettingsStore.get(workspaceId) ?? DEFAULT_USAGE_SETTINGS;
}

function getUsageNotifications(workspaceId: string): UsageNotifications {
  return (
    usageNotificationsStore.get(workspaceId) ?? DEFAULT_USAGE_NOTIFICATIONS
  );
}

export function useUsageSettings({ workspaceId }: { workspaceId: string }) {
  const settings = useSyncExternalStore(
    subscribe,
    () => getUsageSettings(workspaceId),
    () => DEFAULT_USAGE_SETTINGS
  );

  return {
    usageSettings: settings,
    isUsageSettingsLoading: false,
    isUsageSettingsError: false,
  };
}

export function useUpdateUsageSettings({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();

  const doUpdateUsageSettings = useCallback(
    async (patch: Partial<UsageSettings>): Promise<boolean> => {
      const next = { ...getUsageSettings(workspaceId), ...patch };
      usageSettingsStore.set(workspaceId, next);
      notify();
      // TODO: replace with a real POST request once the backend is available.
      sendNotification({
        type: "success",
        title: "Usage settings updated",
        description: "Changes are not persisted yet — backend coming soon.",
      });
      return true;
    },
    [workspaceId, sendNotification]
  );

  return { doUpdateUsageSettings };
}

function getCreditUsageConfigurationEndpoint(workspaceId: string): string {
  return `/api/w/${workspaceId}/credits/usage-configuration`;
}

export function useUsageNotifications({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { fetcher } = useFetcher();
  const configurationFetcher: Fetcher<GetCreditUsageConfigurationResponseBody> =
    fetcher;

  const { data, error, isValidating } = useSWRWithDefaults(
    getCreditUsageConfigurationEndpoint(workspaceId),
    configurationFetcher
  );

  const fromServer: Partial<UsageNotifications> = data
    ? { creditCapWarning: !data.configuration.disableCreditCapWarning }
    : {};

  const usageNotifications: UsageNotifications = {
    ...DEFAULT_USAGE_NOTIFICATIONS,
    ...fromServer,
  };

  return {
    usageNotifications,
    isUsageNotificationsLoading: !data && !error && isValidating,
    isUsageNotificationsError: !!error,
  };
}

export function useUpdateUsageNotifications({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutate } = useSWRWithDefaults(
    getCreditUsageConfigurationEndpoint(workspaceId),
    null
  );

  const doUpdateUsageNotifications = useCallback(
    async (patch: Partial<UsageNotifications>): Promise<boolean> => {
      const body: Record<string, unknown> = {};
      if (patch.creditCapWarning !== undefined) {
        body.disableCreditCapWarning = !patch.creditCapWarning;
      }

      if (Object.keys(body).length > 0) {
        try {
          const res = await clientFetch(
            getCreditUsageConfigurationEndpoint(workspaceId),
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          );
          if (!res.ok) {
            const errorData = await getErrorFromResponse(res);
            sendNotification({
              type: "error",
              title: "Failed to update notification settings",
              description: errorData.message,
            });
            return false;
          }
        } catch (e) {
          sendNotification({
            type: "error",
            title: "Failed to update notification settings",
            description: normalizeError(e).message,
          });
          return false;
        }
        await mutate();
      }

      const next = { ...getUsageNotifications(workspaceId), ...patch };
      usageNotificationsStore.set(workspaceId, next);
      notify();
      sendNotification({
        type: "success",
        title: "Notification settings updated",
      });
      return true;
    },
    [workspaceId, sendNotification, mutate]
  );

  return { doUpdateUsageNotifications };
}
