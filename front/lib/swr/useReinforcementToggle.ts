import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { DEFAULT_REINFORCEMENT_CAP_MICRO_USD } from "@app/lib/reinforcement/constants";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

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
        throw new Error("Failed to update Self-Improving Skills setting");
      }
      setIsEnabled(!isEnabled);
      return true;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update Self-Improving Skills setting",
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
        throw new Error("Failed to update Self-Improving Skills batch mode setting");
      }
      setIsEnabled(!isEnabled);
      return true;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update Self-Improving Skills batch mode setting",
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

  const storedMicroUsd =
    typeof owner.metadata?.reinforcementCapMicroUsd === "number"
      ? owner.metadata.reinforcementCapMicroUsd
      : DEFAULT_REINFORCEMENT_CAP_MICRO_USD;

  const capDollars = storedMicroUsd / 1_000_000;

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
        throw new Error("Failed to update Self-Improving Skills spending cap");
      }
      return true;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update Self-Improving Skills spending cap",
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
