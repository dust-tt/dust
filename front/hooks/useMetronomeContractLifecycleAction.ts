import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { PatchMetronomeContractRequestBody } from "@app/types/api/credits/metronome_contract";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import type { z } from "zod";

type MetronomeContractLifecycleAction = "cancel" | "reactivate";

function useMetronomeContractLifecycleAction({
  workspaceId,
  action,
  errorTitle,
  errorDescription,
  successTitle,
  successDescription,
}: {
  workspaceId: string;
  action: MetronomeContractLifecycleAction;
  errorTitle: string;
  errorDescription: string;
  successTitle: string;
  successDescription: string;
}) {
  const sendNotification = useSendNotification();
  const [isApplying, setIsApplying] = useState(false);

  const applyMetronomeContractLifecycleAction = useCallback(async () => {
    if (isApplying) {
      return false;
    }

    setIsApplying(true);
    try {
      const res = await clientFetch(
        `/api/w/${workspaceId}/metronome/contract`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
          } satisfies z.infer<typeof PatchMetronomeContractRequestBody>),
        }
      );

      if (!res.ok) {
        sendNotification({
          type: "error",
          title: errorTitle,
          description: errorDescription,
        });
        return false;
      }

      sendNotification({
        type: "success",
        title: successTitle,
        description: successDescription,
      });
      return true;
    } finally {
      setIsApplying(false);
    }
  }, [
    action,
    errorDescription,
    errorTitle,
    isApplying,
    sendNotification,
    successDescription,
    successTitle,
    workspaceId,
  ]);

  return {
    applyMetronomeContractLifecycleAction,
    isApplyingMetronomeContractLifecycleAction: isApplying,
  };
}

export function useCancelMetronomeContract({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { t } = useLingui();
  const {
    applyMetronomeContractLifecycleAction,
    isApplyingMetronomeContractLifecycleAction,
  } = useMetronomeContractLifecycleAction({
    workspaceId,
    action: "cancel",
    errorTitle: t`Cancellation failed`,
    errorDescription: t`Failed to cancel your subscription.`,
    successTitle: t`Subscription cancelled`,
    successDescription: t`Your subscription has been cancelled.`,
  });

  return {
    cancelMetronomeContract: applyMetronomeContractLifecycleAction,
    isCancellingMetronomeContract: isApplyingMetronomeContractLifecycleAction,
  };
}

export function useReactivateMetronomeContract({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { t } = useLingui();
  const {
    applyMetronomeContractLifecycleAction,
    isApplyingMetronomeContractLifecycleAction,
  } = useMetronomeContractLifecycleAction({
    workspaceId,
    action: "reactivate",
    errorTitle: t`Reactivation failed`,
    errorDescription: t`Failed to reactivate your subscription.`,
    successTitle: t`Subscription reactivated`,
    successDescription: t`Your subscription will continue normally.`,
  });

  return {
    reactivateMetronomeContract: applyMetronomeContractLifecycleAction,
    isReactivatingMetronomeContract: isApplyingMetronomeContractLifecycleAction,
  };
}
