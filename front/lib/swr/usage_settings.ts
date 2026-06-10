import { useSendNotification } from "@app/hooks/useNotification";
import type {
  GetProgrammaticUsageLimitResponseBody,
  PutProgrammaticUsageLimitResponseBody,
} from "@app/lib/api/credits/programmatic_usage_limit";
import type { GetCreditUsageConfigurationResponseBody } from "@app/lib/api/credits/usage_configuration";
import type {
  GetDefaultUserSpendLimitResponseBody,
  PutDefaultUserSpendLimitResponseBody,
} from "@app/lib/api/workspace/default_user_spend_limit";
import { clientFetch } from "@app/lib/egress/client";
import { invalidateMembersUsage } from "@app/lib/swr/memberships";
import {
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback } from "react";
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
  allowUpgradeRequest: true,
  autoUpgradeFreeToPro: false,
};

const DEFAULT_USAGE_NOTIFICATIONS: UsageNotifications = {
  creditUsageAlertPercent: 80,
  balanceThresholdCredits: null,
  upgradeRequestEmail: true,
};

function getCreditUsageConfigurationEndpoint(workspaceId: string): string {
  return `/api/w/${workspaceId}/credits/usage-configuration`;
}

// Shared PATCH against the usage-configuration endpoint. Both the settings and
// notifications update hooks write to the same endpoint with disjoint fields.
async function patchCreditUsageConfiguration(
  workspaceId: string,
  body: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; message: string }> {
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
      return { ok: false, message: errorData.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: normalizeError(e).message };
  }
}

export function useUsageSettings({ workspaceId }: { workspaceId: string }) {
  const { fetcher } = useFetcher();
  const configurationFetcher: Fetcher<GetCreditUsageConfigurationResponseBody> =
    fetcher;

  const { data, error, isValidating } = useSWRWithDefaults(
    getCreditUsageConfigurationEndpoint(workspaceId),
    configurationFetcher
  );

  const usageSettings: UsageSettings = {
    ...DEFAULT_USAGE_SETTINGS,
    ...(data
      ? { allowUpgradeRequest: data.configuration.allowMemberUpgradeRequests }
      : {}),
  };

  return {
    usageSettings,
    isUsageSettingsLoading: !data && !error && isValidating,
    isUsageSettingsError: !!error,
  };
}

export function useUpdateUsageSettings({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutate } = useSWRWithDefaults(
    getCreditUsageConfigurationEndpoint(workspaceId),
    null
  );

  const doUpdateUsageSettings = useCallback(
    async (patch: Partial<UsageSettings>): Promise<boolean> => {
      const body: Record<string, unknown> = {};
      if (patch.allowUpgradeRequest !== undefined) {
        body.allowMemberUpgradeRequests = patch.allowUpgradeRequest;
      }
      // TODO: `autoUpgradeFreeToPro` is intentionally not persisted (out of scope).

      if (Object.keys(body).length === 0) {
        return true;
      }

      const result = await patchCreditUsageConfiguration(workspaceId, body);
      if (!result.ok) {
        sendNotification({
          type: "error",
          title: "Failed to update usage settings",
          description: result.message,
        });
        return false;
      }

      await mutate();
      sendNotification({
        type: "success",
        title: "Usage settings updated",
      });
      return true;
    },
    [workspaceId, sendNotification, mutate]
  );

  return { doUpdateUsageSettings };
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

  const usageNotifications: UsageNotifications = {
    ...DEFAULT_USAGE_NOTIFICATIONS,
    ...(data
      ? {
          balanceThresholdCredits: data.configuration.balanceThresholdCredits,
          upgradeRequestEmail: data.configuration.upgradeRequestEmailEnabled,
        }
      : {}),
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
      if (patch.upgradeRequestEmail !== undefined) {
        body.upgradeRequestEmailEnabled = patch.upgradeRequestEmail;
      }

      if (Object.keys(body).length === 0) {
        return true;
      }

      const result = await patchCreditUsageConfiguration(workspaceId, body);
      if (!result.ok) {
        sendNotification({
          type: "error",
          title: "Failed to update notification settings",
          description: result.message,
        });
        return false;
      }

      await mutate();
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

// Programmatic usage limit

const GetProgrammaticUsageLimitResponseSchema = z.object({
  monthlyCapCredits: z.number().int().nullable(),
});

function programmaticUsageLimitUrl(workspaceId: string): string {
  return `/api/w/${workspaceId}/usage_settings/programmatic_usage_limit`;
}

export function useProgrammaticUsageLimit({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { fetcher } = useFetcher();
  const limitFetcher: Fetcher<GetProgrammaticUsageLimitResponseBody> = async (
    url: string
  ) => {
    const result = await fetcher(url);
    return GetProgrammaticUsageLimitResponseSchema.parse(result);
  };
  const { data, error } = useSWRWithDefaults(
    programmaticUsageLimitUrl(workspaceId),
    limitFetcher
  );

  return {
    programmaticUsageLimit: data,
    isProgrammaticUsageLimitLoading: !error && !data,
    isProgrammaticUsageLimitError: !!error,
  };
}

export function useUpdateProgrammaticUsageLimit({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();

  const doUpdateProgrammaticUsageLimit = useCallback(
    async (
      monthlyCapCredits: number | null
    ): Promise<PutProgrammaticUsageLimitResponseBody | null> => {
      const res = await clientFetch(programmaticUsageLimitUrl(workspaceId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyCapCredits }),
      });

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to update programmatic usage limit",
          description: errorData.message,
        });
        return null;
      }

      const body = GetProgrammaticUsageLimitResponseSchema.parse(
        await res.json()
      );

      if (monthlyCapCredits === null) {
        sendNotification({
          type: "success",
          title: "Programmatic usage limit has been removed",
        });
      } else {
        sendNotification({
          type: "success",
          title: "Programmatic usage limit updated",
          description: `The monthly programmatic usage limit has been set to ${monthlyCapCredits.toLocaleString("en-US")} credits.`,
        });
      }

      await mutate(programmaticUsageLimitUrl(workspaceId));
      return body;
    },
    [workspaceId, sendNotification]
  );

  return { doUpdateProgrammaticUsageLimit };
}
