import { useSendNotification } from "@app/hooks/useNotification";
import type { WorkspaceMigrationStatus } from "@app/lib/api/billing/migration_lifecycle";
import { clientFetch } from "@app/lib/egress/client";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { useCallback, useState } from "react";
import type { Fetcher } from "swr";

/**
 * Read the workspace's scheduled legacy → Business migration state (whether a
 * pending Business contract is staged, and for which date). Skips the fetch when
 * `disabled` (e.g. the workspace isn't a migration candidate).
 */
export function useWorkspaceMigration({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const migrationFetcher: Fetcher<WorkspaceMigrationStatus> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/metronome/migration`,
    migrationFetcher,
    { disabled }
  );

  return {
    pendingMigrationDate: data?.pendingMigrationDate ?? null,
    willBeRefundedOnEnd: data?.willBeRefundedOnEnd ?? false,
    isMigrationLoading: !error && !data && !disabled,
    isMigrationError: error,
    mutateMigration: mutate,
  };
}

type MigrationLifecycleAction = "cancel" | "resume";

function useMigrationLifecycleAction({
  workspaceId,
  action,
  errorTitle,
  successTitle,
  successDescription,
}: {
  workspaceId: string;
  action: MigrationLifecycleAction;
  errorTitle: string;
  successTitle: string;
  successDescription: string;
}) {
  const sendNotification = useSendNotification();
  const [isApplying, setIsApplying] = useState(false);

  const apply = useCallback(async () => {
    if (isApplying) {
      return false;
    }
    setIsApplying(true);
    try {
      const res = await clientFetch(
        `/api/w/${workspaceId}/metronome/migration`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        sendNotification({
          type: "error",
          title: errorTitle,
          description:
            body?.error?.message ?? "Please try again or contact support.",
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
    sendNotification,
    successDescription,
    successTitle,
    workspaceId,
  ]);

  return { apply, isApplying };
}

export function useCancelWorkspaceMigration({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { apply, isApplying } = useMigrationLifecycleAction({
    workspaceId,
    action: "cancel",
    errorTitle: "Cancellation failed",
    successTitle: "Subscription cancelled",
    successDescription:
      "Your subscription will end at the end of the current period.",
  });
  return {
    cancelMigration: apply,
    isCancellingMigration: isApplying,
  };
}

export function useResumeWorkspaceMigration({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { apply, isApplying } = useMigrationLifecycleAction({
    workspaceId,
    action: "resume",
    errorTitle: "Resume failed",
    successTitle: "Subscription resumed",
    successDescription:
      "Your migration to the new pricing has been re-scheduled.",
  });
  return {
    resumeMigration: apply,
    isResumingMigration: isApplying,
  };
}
