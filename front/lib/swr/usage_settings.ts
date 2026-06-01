import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { invalidateMembersUsage } from "@app/lib/swr/memberships";
import {
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetCreditUsageConfigurationResponseBody } from "@app/pages/api/w/[wId]/credits/usage-configuration";
import type {
  GetDefaultUserSpendLimitResponseBody,
  PutDefaultUserSpendLimitResponseBody,
} from "@app/pages/api/w/[wId]/usage_settings/default_user_spend_limit";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback, useSyncExternalStore } from "react";
import type { Fetcher } from "swr";
import { mutate } from "swr";
import { z } from "zod";

const GetDefaultUserSpendLimitResponseSchema = z.object({
  awuCredits: z.number().int().nullable(),
});

const PutDefaultUserSpendLimitResponseSchema = z.object({
  awuCredits: z.number().int(),
});

export interface UsageSettings {
  allowUpgradeRequest: boolean;
  autoUpgradeFreeToPro: boolean;
}

export interface UsageNotifications {
  creditUsageAlertPercent: number;
  balanceThresholdCredits: number | null;
  upgradeRequestEmail: boolean;
}

const DEFAULT_USAGE_SETTINGS: UsageSettings = {
  allowUpgradeRequest: false,
  autoUpgradeFreeToPro: false,
};

const DEFAULT_USAGE_NOTIFICATIONS: UsageNotifications = {
  creditUsageAlertPercent: 80,
  balanceThresholdCredits: null,
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
    ? { balanceThresholdCredits: data.configuration.balanceThresholdCredits }
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
      if (patch.balanceThresholdCredits !== undefined) {
        body.balanceThresholdCredits = patch.balanceThresholdCredits;
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

function defaultUserSpendLimitUrl(workspaceId: string): string {
  return `/api/w/${workspaceId}/usage_settings/default_user_spend_limit`;
}

export function useDefaultUserSpendLimit({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const defaultFetcher: Fetcher<GetDefaultUserSpendLimitResponseBody> = async (
    url: string
  ) => {
    const result = await fetcher(url);
    return GetDefaultUserSpendLimitResponseSchema.parse(result);
  };
  const { data, error, mutate } = useSWRWithDefaults(
    defaultUserSpendLimitUrl(workspaceId),
    defaultFetcher,
    { disabled }
  );

  return {
    defaultUserSpendLimit: data,
    isDefaultUserSpendLimitLoading: !error && !data && !disabled,
    isDefaultUserSpendLimitError: !!error,
    mutateDefaultUserSpendLimit: mutate,
  };
}

export function useUpdateDefaultUserSpendLimit({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();

  const doUpdateDefaultUserSpendLimit = useCallback(
    async (
      awuCredits: number
    ): Promise<PutDefaultUserSpendLimitResponseBody | null> => {
      try {
        const res = await clientFetch(defaultUserSpendLimitUrl(workspaceId), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ awuCredits }),
        });

        if (!res.ok) {
          const errorData = await getErrorFromResponse(res);
          sendNotification({
            type: "error",
            title: "Failed to update default spend limit",
            description: errorData.message,
          });
          return null;
        }

        const body = PutDefaultUserSpendLimitResponseSchema.parse(
          await res.json()
        );
        sendNotification({
          type: "success",
          title: "Default spend limit updated",
          description: `The default per-user spend limit has been set to ${body.awuCredits.toLocaleString(
            "en-US"
          )} credits.`,
        });

        await mutate(defaultUserSpendLimitUrl(workspaceId));
        await invalidateMembersUsage(workspaceId);
        return body;
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Failed to update default spend limit",
          description: normalizeError(e).message,
        });
        return null;
      }
    },
    [workspaceId, sendNotification]
  );

  return { doUpdateDefaultUserSpendLimit };
}
