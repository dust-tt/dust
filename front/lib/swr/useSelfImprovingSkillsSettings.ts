import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  getReinforcementMonthlyCapMicroUsd,
  getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd,
} from "@app/lib/reinforcement/consumption";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetReinforcementDailySpendResponseBody } from "@app/pages/api/w/[wId]/skills/reinforcement_daily_spend";
import type { GetSkillsSpendResponseBody } from "@app/pages/api/w/[wId]/skills/reinforcement_spend";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";
import type { Fetcher } from "swr";

interface UseSelfImprovingToggleProps {
  owner: LightWorkspaceType;
}

export function useSelfImprovingToggle({ owner }: UseSelfImprovingToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [isEnabled, setIsEnabled] = useState(
    owner.metadata?.allowReinforcement === true
  );

  const doToggleReinforcement = async () => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allowReinforcement: !isEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update agent reinforcement setting");
      }
      setIsEnabled(!isEnabled);
      return true;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update agent reinforcement setting",
        description: normalizeError(error).message,
      });
      return false;
    } finally {
      setIsChanging(false);
    }
  };

  return {
    isEnabled,
    isChanging,
    doToggleReinforcement,
  };
}

interface UseSelfImprovingBatchModeToggleProps {
  owner: LightWorkspaceType;
}

export function useSelfImprovingBatchModeToggle({
  owner,
}: UseSelfImprovingBatchModeToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [isEnabled, setIsEnabled] = useState(
    owner.metadata?.allowReinforcementBatchMode !== false
  );

  const doToggleBatchMode = async () => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allowReinforcementBatchMode: !isEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update reinforcement batch mode setting");
      }
      setIsEnabled(!isEnabled);
      return true;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update reinforcement batch mode setting",
        description: normalizeError(error).message,
      });
      return false;
    } finally {
      setIsChanging(false);
    }
  };

  return {
    isEnabled,
    isChanging,
    doToggleBatchMode,
  };
}

interface UseSelfImprovingCapSettingProps {
  owner: LightWorkspaceType;
}

export function useSelfImprovingCapSetting({
  owner,
}: UseSelfImprovingCapSettingProps) {
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);

  const capDollars = getReinforcementMonthlyCapMicroUsd(owner) / 1_000_000;

  const saveCapDollars = async (dollars: number): Promise<boolean> => {
    setIsSaving(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reinforcementCapMicroUsd: Math.round(dollars * 1_000_000),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update reinforcement spending cap");
      }
      return true;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update reinforcement spending cap",
        description: normalizeError(error).message,
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    capDollars,
    isSaving,
    saveCapDollars,
  };
}

export function useSkillsSelfImprovingSpend({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const spendFetcher: Fetcher<GetSkillsSpendResponseBody> = fetcher;

  const { data, error, isLoading, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/skills/reinforcement_spend`,
    spendFetcher,
    { disabled }
  );

  return {
    spentMicroUsdBySkillId: data?.spentMicroUsdBySkillId ?? {},
    isSpendLoading: isLoading,
    isSpendError: !!error,
    mutateSpend: mutate,
  };
}

export function useSelfImprovingDailySpend({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const dailyFetcher: Fetcher<GetReinforcementDailySpendResponseBody> = fetcher;

  const { data, error, isLoading } = useSWRWithDefaults(
    `/api/w/${owner.sId}/skills/reinforcement_daily_spend`,
    dailyFetcher,
    { disabled }
  );

  return {
    dailySpendMicroUsd: data?.dailySpendMicroUsd ?? {},
    periodStartDate: data?.periodStartDate ?? null,
    periodEndDate: data?.periodEndDate ?? null,
    isDailySpendLoading: isLoading,
    isDailySpendError: !!error,
  };
}

interface UseSelfImprovementCapPerSkillSettingProps {
  owner: LightWorkspaceType;
}

export function useSelfImprovementCapPerSkillSetting({
  owner,
}: UseSelfImprovementCapPerSkillSettingProps) {
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);

  const capDollars =
    getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd(owner) / 1_000_000;

  const saveCapDollars = async (dollars: number): Promise<boolean> => {
    setIsSaving(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selfImprovementCapPerSkillMicroUsd: Math.round(dollars * 1_000_000),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update self-improvement cost cap per skill");
      }
      return true;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update self-improvement cost cap per skill",
        description: normalizeError(error).message,
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    capDollars,
    isSaving,
    saveCapDollars,
  };
}
