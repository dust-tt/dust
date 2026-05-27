import type { AwuPoolSummaryResponseBody } from "@app/lib/api/credits/awu_pool_summary";
import type { GetMembersSeatsResponseBody } from "@app/lib/api/credits/members_seats";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetCreditPurchaseInfoResponseBody } from "@app/pages/api/w/[wId]/credits/purchase";
import type { GetAwuPurchaseInfoResponseBody } from "@app/pages/api/w/[wId]/subscriptions/awu-purchase";
import type { GetAwuPurchaseStatusResponseBody } from "@app/pages/api/w/[wId]/subscriptions/awu-purchase-status";
import type {
  GetCreditsResponseBody,
  PendingCreditData,
} from "@app/types/credits";
import { useCallback, useSyncExternalStore } from "react";
import type { Fetcher } from "swr";

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
  metronomeCustomerId,
  disabled,
}: {
  workspaceId: string;
  metronomeCustomerId?: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const creditsFetcher: Fetcher<GetCreditsResponseBody> = fetcher;

  const endpoint = metronomeCustomerId
    ? `/api/w/${workspaceId}/credits/metronome-balances`
    : `/api/w/${workspaceId}/credits`;

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    endpoint,
    creditsFetcher,
    {
      disabled,
      refreshInterval: metronomeCustomerId
        ? undefined
        : () => {
            const count = getPostPurchaseRefreshCount(workspaceId);
            if (count < 5) {
              incrementPostPurchaseRefreshCount(workspaceId);
              return 5000;
            }
            return 0;
          },
    }
  );

  const pendingCredits: PendingCreditData[] = data?.pendingCredits ?? [];

  return {
    credits: data?.credits ?? emptyArray(),
    pendingCredits,
    isCreditsLoading: !error && !data && !disabled,
    isCreditsValidating: isValidating,
    isCreditsError: error,
    mutateCredits: mutate,
  };
}

export type PurchaseResult =
  | { status: "success" }
  | { status: "redirect"; paymentUrl: string }
  | { status: "error"; message: string };

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

  const purchaseCredits = useCallback(
    async (amountDollars: number): Promise<PurchaseResult> => {
      if (getPurchaseLoading(workspaceId)) {
        return { status: "error", message: "Purchase already in progress" };
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

          return { status: "error", message: errorMessage };
        }

        const responseData = await response.json();

        if (responseData.paymentUrl) {
          return { status: "redirect", paymentUrl: responseData.paymentUrl };
        }

        resetPostPurchaseRefreshCount(workspaceId);
        void mutateCredits();

        return { status: "success" };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to purchase credits";

        return { status: "error", message: errorMessage };
      } finally {
        setPurchaseLoading(workspaceId, false);
      }
    },
    [workspaceId, mutateCredits]
  );

  return {
    purchaseCredits,
    isLoading,
  };
}

export function useCreditPurchaseInfo({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const creditPurchaseInfoFetcher: Fetcher<GetCreditPurchaseInfoResponseBody> =
    fetcher;

  const { data, error, isValidating } = useSWRWithDefaults(
    `/api/w/${workspaceId}/credits/purchase`,
    creditPurchaseInfoFetcher,
    {
      disabled,
    }
  );

  return {
    isEnterprise: data?.isEnterprise ?? false,
    currency: data?.currency ?? "usd",
    discountPercent: data?.discountPercent ?? 0,
    creditPricing: data?.creditPricing ?? null,
    creditPurchaseLimits: data?.creditPurchaseLimits ?? null,
    billingCycleStartDay: data?.billingCycleStartDay ?? null,
    isCreditPurchaseInfoLoading: !error && !data && !disabled,
    isCreditPurchaseInfoValidating: isValidating,
    isCreditPurchaseInfoError: error,
  };
}

const awuPostPurchaseRefreshState = new Map<string, number>();
const awuPostPurchaseRefreshListeners = new Set<() => void>();

function getAwuPostPurchaseRefreshCount(workspaceId: string): number {
  return awuPostPurchaseRefreshState.get(workspaceId) ?? Infinity;
}

function incrementAwuPostPurchaseRefreshCount(workspaceId: string): void {
  const current = awuPostPurchaseRefreshState.get(workspaceId) ?? Infinity;
  if (current < 5) {
    awuPostPurchaseRefreshState.set(workspaceId, current + 1);
    awuPostPurchaseRefreshListeners.forEach((listener) => listener());
  }
}

export function resetAwuPostPurchaseRefreshCount(workspaceId: string): void {
  awuPostPurchaseRefreshState.set(workspaceId, 0);
  awuPostPurchaseRefreshListeners.forEach((listener) => listener());
}

export function useAwuPoolSummary({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const awuFetcher: Fetcher<AwuPoolSummaryResponseBody> = fetcher;

  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/credits/awu-pool-summary`,
    awuFetcher,
    {
      disabled,
      refreshInterval: () => {
        const count = getAwuPostPurchaseRefreshCount(workspaceId);
        if (count < 5) {
          incrementAwuPostPurchaseRefreshCount(workspaceId);
          return 5000;
        }
        return 0;
      },
    }
  );

  return {
    totalRemainingCredits: data?.totalRemainingCredits ?? 0,
    consumedByUsersCredits: data?.consumedByUsersCredits ?? 0,
    consumedByProgrammaticCredits: data?.consumedByProgrammaticCredits ?? 0,
    resetDate: data?.resetDate ?? "",
    isAwuPoolSummaryLoading: !error && !data && !disabled,
    isAwuPoolSummaryError: error,
    isAwuPoolSummaryValidating: isValidating,
    mutateAwuPoolSummary: mutate,
  };
}

// Polls the latest AWU purchase attempt status for a workspace. The dialog
// drives `disabled` off its own "processing" state so we only poll while a
// purchase is in flight.
export function useAwuPurchaseStatus({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const statusFetcher: Fetcher<GetAwuPurchaseStatusResponseBody> = fetcher;

  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/subscriptions/awu-purchase-status`,
    statusFetcher,
    {
      disabled,
      refreshInterval: (latest) => {
        if (!latest?.attempt) {
          return 2000;
        }
        return latest.attempt.status === "pending" ? 2000 : 0;
      },
    }
  );

  return {
    attempt: data?.attempt ?? null,
    isAwuPurchaseStatusLoading: !error && !data && !disabled,
    isAwuPurchaseStatusValidating: isValidating,
    isAwuPurchaseStatusError: error,
    mutateAwuPurchaseStatus: mutate,
  };
}

export function useAwuPurchaseInfo({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const awuPurchaseInfoFetcher: Fetcher<GetAwuPurchaseInfoResponseBody> =
    fetcher;

  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/subscriptions/awu-purchase`,
    awuPurchaseInfoFetcher,
    { disabled }
  );

  return {
    awuPurchaseInfo: data ?? null,
    isAwuPurchaseInfoLoading: !error && !data && !disabled,
    isAwuPurchaseInfoValidating: isValidating,
    isAwuPurchaseInfoError: error,
    mutateAwuPurchaseInfo: mutate,
  };
}

const EMPTY_SEAT_PLANS: SeatPlanResponseBody = {};

export function useMembersSeats({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const membersSeatsFetcher: Fetcher<GetMembersSeatsResponseBody> = fetcher;

  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/credits/members-seats`,
    membersSeatsFetcher,
    { disabled }
  );

  return {
    membersSeats: data?.seatTypes ?? {},
    totalMembersSeats: data?.total ?? 0,
    isMembersSeatsLoading: !error && !data && !disabled,
    isMembersSeatsError: error,
    isMembersSeatsValidating: isValidating,
    mutateMembersSeats: mutate,
  };
}

export function useSeatPlan({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const seatPlanFetcher: Fetcher<SeatPlanResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/seats/plan`,
    seatPlanFetcher,
    { disabled }
  );

  return {
    seatPlans: data ?? EMPTY_SEAT_PLANS,
    isSeatPlanLoading: !error && !data && !disabled,
    isSeatPlanError: error,
  };
}
