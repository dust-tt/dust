import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  getReinforcementMonthlyCapMicroUsd,
  getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd,
} from "@app/lib/reinforcement/consumption";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetSkillsSpendResponseBody } from "@app/pages/api/w/[wId]/skills/reinforcement_spend";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";
import type { Fetcher } from "swr";

interface UseReinforcementToggleProps {
  owner: LightWorkspaceType;
}

export function useReinforcementToggle({ owner }: UseReinforcementToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [isEnabled, setIsEnabled] = useState(
    owner.metadata?.allowReinforcement !== false
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

interface UseReinforcementBatchModeToggleProps {
  owner: LightWorkspaceType;
}

export function useReinforcementBatchModeToggle({
  owner,
}: UseReinforcementBatchModeToggleProps) {
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

interface UseReinforcementCapSettingProps {
  owner: LightWorkspaceType;
}

export function useReinforcementCapSetting({
  owner,
}: UseReinforcementCapSettingProps) {
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

export function useSkillsReinforcementSpend({
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
