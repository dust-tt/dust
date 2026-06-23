import { useSendNotification } from "@app/hooks/useNotification";
import { useAuth } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import {
  getReinforcementMonthlyCapAwuCredits,
  getReinforcementMonthlyCapMicroUsd,
  getWorkspaceDefaultSelfImprovementCapPerSkillAwuCredits,
  getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd,
} from "@app/lib/reinforcement/consumption";
import type { ReinforcementBillingUnit } from "@app/lib/reinforcement/enforcement";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  GetReinforcementDailySpendResponseBody,
  GetSkillsSpendResponseBody,
} from "@app/types/api/skills";
import { isCreditPricedPlan } from "@app/types/plan";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";
import type { Fetcher } from "swr";

/**
 * Client-side mirror of getReinforcementBillingUnit
 * (lib/reinforcement/enforcement.ts): self-improving skills spend and caps
 * are displayed and edited in AWU credits for workspaces billed by Metronome
 * on a credit-priced plan, and in dollars otherwise.
 */
export function useReinforcementBillingUnit({
  owner,
}: {
  owner: LightWorkspaceType;
}): ReinforcementBillingUnit {
  const { subscription } = useAuth();
  return owner.metronomeCustomerId && isCreditPricedPlan(subscription.plan)
    ? "awu_credits"
    : "micro_usd";
}

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
  const unit = useReinforcementBillingUnit({ owner });
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);

  // Cap in the display unit: AWU credits, or dollars for micro-USD.
  const cap =
    unit === "awu_credits"
      ? getReinforcementMonthlyCapAwuCredits(owner)
      : getReinforcementMonthlyCapMicroUsd(owner) / 1_000_000;

  const saveCap = async (value: number): Promise<boolean> => {
    setIsSaving(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          unit === "awu_credits"
            ? { reinforcementCapAwuCredits: Math.round(value) }
            : { reinforcementCapMicroUsd: Math.round(value * 1_000_000) }
        ),
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
    unit,
    cap,
    isSaving,
    saveCap,
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
    spentAwuCreditsBySkillId: data?.spentAwuCreditsBySkillId ?? {},
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
    dailySpendAwuCredits: data?.dailySpendAwuCredits ?? {},
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
  const unit = useReinforcementBillingUnit({ owner });
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);

  // Cap in the display unit: AWU credits, or dollars for micro-USD.
  const cap =
    unit === "awu_credits"
      ? getWorkspaceDefaultSelfImprovementCapPerSkillAwuCredits(owner)
      : getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd(owner) /
        1_000_000;

  const saveCap = async (value: number): Promise<boolean> => {
    setIsSaving(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          unit === "awu_credits"
            ? { selfImprovementCapPerSkillAwuCredits: Math.round(value) }
            : {
                selfImprovementCapPerSkillMicroUsd: Math.round(
                  value * 1_000_000
                ),
              }
        ),
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
    unit,
    cap,
    isSaving,
    saveCap,
  };
}
