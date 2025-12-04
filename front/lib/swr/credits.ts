import { useCallback, useSyncExternalStore } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetCreditsResponseBody } from "@app/types/credits";

// Global state for tracking purchase loading status per workspace
const purchaseLoadingState = new Map<string, boolean>();
const purchaseLoadingListeners = new Set<() => void>();

function setPurchaseLoading(workspaceId: string, loading: boolean) {
  purchaseLoadingState.set(workspaceId, loading);
  purchaseLoadingListeners.forEach((listener) => listener());
}

function getPurchaseLoading(workspaceId: string): boolean {
  return purchaseLoadingState.get(workspaceId) ?? false;
}

function subscribeToPurchaseLoading(callback: () => void) {
  purchaseLoadingListeners.add(callback);
  return () => {
    purchaseLoadingListeners.delete(callback);
  };
}

// Global state for tracking post-purchase refresh count per workspace
const postPurchaseRefreshState = new Map<string, number>();
const postPurchaseRefreshListeners = new Set<() => void>();

function getPostPurchaseRefreshCount(workspaceId: string): number {
  return postPurchaseRefreshState.get(workspaceId) ?? Infinity;
}

function incrementPostPurchaseRefreshCount(workspaceId: string): void {
  const current = postPurchaseRefreshState.get(workspaceId) ?? Infinity;
  if (current < 5) {
    postPurchaseRefreshState.set(workspaceId, current + 1);
    postPurchaseRefreshListeners.forEach((listener) => listener());
  }
}

function resetPostPurchaseRefreshCount(workspaceId: string): void {
  postPurchaseRefreshState.set(workspaceId, 0);
  postPurchaseRefreshListeners.forEach((listener) => listener());
}

export function useCredits({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const creditsFetcher: Fetcher<GetCreditsResponseBody> = fetcher;

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    `/api/w/${workspaceId}/credits`,
    creditsFetcher,
    {
      disabled,
      refreshInterval: () => {
        const count = getPostPurchaseRefreshCount(workspaceId);
        if (count < 5) {
          incrementPostPurchaseRefreshCount(workspaceId);
          return 5000;
        }
        return 0;
      },
    }
  );

  return {
    credits: data?.credits ?? emptyArray(),
    isCreditsLoading: !error && !data && !disabled,
    isCreditsValidating: isValidating,
    isCreditsError: error,
    mutateCredits: mutate,
  };
}

export function usePurchaseCredits({ workspaceId }: { workspaceId: string }) {
  const isLoading = useSyncExternalStore(
    subscribeToPurchaseLoading,
    () => getPurchaseLoading(workspaceId),
    () => false
  );

  const { mutateCredits } = useCredits({
    disabled: true,
    workspaceId,
  });

  const sendNotification = useSendNotification();

  const purchaseCredits = useCallback(
    async (amountDollars: number): Promise<boolean> => {
      if (getPurchaseLoading(workspaceId)) {
        return false;
      }

      setPurchaseLoading(workspaceId, true);

      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/credits/purchase`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ amountDollars }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          const errorMessage =
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            errorData.error?.message || "Failed to purchase credits";

          sendNotification({
            type: "error",
            title: "Purchase failed",
            description: `${errorMessage}. Please contact support if the issue persists.`,
          });
          return false;
        }

        const responseData = await response.json();

        // If payment requires additional action, redirect to Stripe's hosted invoice page.
        if (responseData.paymentUrl) {
          window.location.href = responseData.paymentUrl;
          return true;
        }

        resetPostPurchaseRefreshCount(workspaceId);

        sendNotification({
          type: "success",
          title: "Credits purchased",
          description: `Successfully added $${amountDollars} in credits`,
        });

        void mutateCredits();
        return true;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to purchase credits";

        sendNotification({
          type: "error",
          title: "Purchase failed",
          description: `${errorMessage}. Please contact support if the issue persists.`,
        });
        return false;
      } finally {
        setPurchaseLoading(workspaceId, false);
      }
    },
    [workspaceId, mutateCredits, sendNotification]
  );

  return {
    purchaseCredits,
    isLoading,
  };
}
