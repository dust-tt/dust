import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { useCallback, useState } from "react";

type SubscriptionCancellationAction = "cancel" | "resume";

function useSubscriptionCancellationAction({
  workspaceId,
  action,
  errorTitle,
  successTitle,
  successDescription,
}: {
  workspaceId: string;
  action: SubscriptionCancellationAction;
  errorTitle: string;
  successTitle: string;
  successDescription: string;
}) {
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const [isApplying, setIsApplying] = useState(false);

  const apply = useCallback(async () => {
    if (isApplying) {
      return false;
    }
    setIsApplying(true);
    try {
      const res = await clientFetch(
        `/api/w/${workspaceId}/metronome/cancellation`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: errorTitle,
          error: errorData,
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
    errorTitle,
    isApplying,
    sendApiErrorNotification,
    sendNotification,
    successDescription,
    successTitle,
    workspaceId,
  ]);

  return { apply, isApplying };
}

export function useCancelWorkspaceSubscription({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { apply, isApplying } = useSubscriptionCancellationAction({
    workspaceId,
    action: "cancel",
    errorTitle: "Cancellation failed",
    successTitle: "Subscription cancelled",
    successDescription:
      "Your subscription will end at the end of the current period.",
  });
  return {
    cancelSubscription: apply,
    isCancellingSubscription: isApplying,
  };
}

export function useResumeWorkspaceSubscription({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { apply, isApplying } = useSubscriptionCancellationAction({
    workspaceId,
    action: "resume",
    errorTitle: "Resume failed",
    successTitle: "Subscription resumed",
    successDescription: "Your subscription has been resumed.",
  });
  return {
    resumeSubscription: apply,
    isResumingSubscription: isApplying,
  };
}
