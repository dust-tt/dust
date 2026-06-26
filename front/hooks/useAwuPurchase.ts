import { clientFetch } from "@app/lib/egress/client";
import {
  resetAwuPostPurchaseRefreshCount,
  useAwuPoolSummary,
  useAwuPurchaseInfo,
} from "@app/lib/swr/credits";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback, useSyncExternalStore } from "react";

const awuPurchaseLoadingState = new Map<string, boolean>();
const awuPurchaseLoadingListeners = new Set<() => void>();

function setAwuPurchaseLoading(workspaceId: string, loading: boolean) {
  awuPurchaseLoadingState.set(workspaceId, loading);
  awuPurchaseLoadingListeners.forEach((listener) => listener());
}

function getAwuPurchaseLoading(workspaceId: string): boolean {
  return awuPurchaseLoadingState.get(workspaceId) ?? false;
}

function subscribeToAwuPurchaseLoading(callback: () => void) {
  awuPurchaseLoadingListeners.add(callback);
  return () => {
    awuPurchaseLoadingListeners.delete(callback);
  };
}

export type AwuPurchaseOutcome =
  | { status: "success" }
  | { status: "error"; message: string };

export function useAwuPurchase({ workspaceId }: { workspaceId: string }) {
  const isPurchasing = useSyncExternalStore(
    subscribeToAwuPurchaseLoading,
    () => getAwuPurchaseLoading(workspaceId),
    () => false
  );

  const { mutateAwuPoolSummary } = useAwuPoolSummary({
    workspaceId,
    disabled: true,
  });

  const { mutateAwuPurchaseInfo } = useAwuPurchaseInfo({
    workspaceId,
    disabled: true,
  });

  const purchaseAwuCredits = useCallback(
    async (amountCredits: number): Promise<AwuPurchaseOutcome> => {
      if (getAwuPurchaseLoading(workspaceId)) {
        return { status: "error", message: "Purchase already in progress" };
      }

      setAwuPurchaseLoading(workspaceId, true);

      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/subscriptions/awu-purchase`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amountCredits }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          const message =
            errorData?.error?.message ?? "Failed to purchase credits";
          return { status: "error", message };
        }

        await response.json();

        void mutateAwuPurchaseInfo();
        resetAwuPostPurchaseRefreshCount(workspaceId);
        void mutateAwuPoolSummary();

        return { status: "success" };
      } catch (err) {
        return { status: "error", message: normalizeError(err).message };
      } finally {
        setAwuPurchaseLoading(workspaceId, false);
      }
    },
    [workspaceId, mutateAwuPoolSummary, mutateAwuPurchaseInfo]
  );

  return { isPurchasing, purchaseAwuCredits };
}
