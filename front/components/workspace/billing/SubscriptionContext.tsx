import {
  useCancelMetronomeContract,
  useReactivateMetronomeContract,
} from "@app/hooks/useMetronomeContractLifecycleAction";
import { useSubmitFunction } from "@app/lib/client/utils";
import type { MetronomeInvoiceSummary } from "@app/lib/metronome/invoice";
import { isBusinessPlanPrefix } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import { useMetronomeInvoice } from "@app/lib/swr/workspaces";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { SubscriptionType } from "@app/types/plan";
import { isSubscriptionMetronomeBilled } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";
import type { SubscriptionStatus } from "./SubscriptionStatusChip";

interface SubscriptionContextType {
  owner: LightWorkspaceType;
  subscription: SubscriptionType;
  invoice: MetronomeInvoiceSummary | null;
  isMetronomeInvoiceLoading: boolean;
  isCancellablePlan: boolean;
  isCancellationScheduled: boolean;
  subscriptionEndsAtMs: number | null;
  subscriptionStatus: SubscriptionStatus;
  canCancelSubscription: boolean;
  canReactivateSubscription: boolean;
  isCancellingSubscription: boolean;
  isReactivatingSubscription: boolean;
  periodEndLabel: string | null;
  subscriptionEndLabel: string | null;
  showCancelDialog: boolean;
  setShowCancelDialog: (show: boolean) => void;
  showReactivateDialog: boolean;
  setShowReactivateDialog: (show: boolean) => void;
  cancelSubscription: () => Promise<void>;
  reactivateSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

export function useSubscriptionContext(): SubscriptionContextType {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error(
      "useSubscriptionContext must be used within SubscriptionProvider"
    );
  }
  return ctx;
}

interface SubscriptionProviderProps {
  owner: LightWorkspaceType;
  subscription: SubscriptionType;
  children: ReactNode;
}

export function SubscriptionProvider({
  owner,
  subscription,
  children,
}: SubscriptionProviderProps) {
  const router = useAppRouter();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showReactivateDialog, setShowReactivateDialog] = useState(false);

  const { invoice, isMetronomeInvoiceLoading } = useMetronomeInvoice({
    workspaceId: owner.sId,
    disabled: !subscription.metronomeContractId,
  });
  const { cancelMetronomeContract, isCancellingMetronomeContract } =
    useCancelMetronomeContract({ workspaceId: owner.sId });
  const { reactivateMetronomeContract, isReactivatingMetronomeContract } =
    useReactivateMetronomeContract({ workspaceId: owner.sId });

  const { submit: cancelSubscription, isSubmitting: isCancellingViaSubmit } =
    useSubmitFunction(async () => {
      try {
        const success = await cancelMetronomeContract();
        if (success) {
          router.reload();
        }
      } finally {
        setShowCancelDialog(false);
      }
    });

  const {
    submit: reactivateSubscription,
    isSubmitting: isReactivatingViaSubmit,
  } = useSubmitFunction(async () => {
    try {
      const success = await reactivateMetronomeContract();
      if (success) {
        router.reload();
      }
    } finally {
      setShowReactivateDialog(false);
    }
  });

  const isCancellablePlan =
    isSubscriptionMetronomeBilled(subscription) &&
    isBusinessPlanPrefix(subscription.plan.code);
  const isCancellationScheduled =
    subscription.endDate !== null || subscription.requestCancelAt !== null;
  const subscriptionEndsAtMs =
    subscription.endDate ??
    (isCancellationScheduled ? (invoice?.currentPeriodEndMs ?? null) : null);
  const subscriptionStatus: SubscriptionStatus =
    isCancellationScheduled && subscriptionEndsAtMs !== null
      ? subscriptionEndsAtMs <= Date.now()
        ? "ended"
        : "cancelled"
      : "active";
  const canCancelSubscription = isCancellablePlan && !isCancellationScheduled;
  const canReactivateSubscription =
    isCancellablePlan &&
    isCancellationScheduled &&
    subscriptionEndsAtMs !== null &&
    subscriptionEndsAtMs > Date.now();
  const isCancellingSubscription =
    isCancellingViaSubmit || isCancellingMetronomeContract;
  const isReactivatingSubscription =
    isReactivatingViaSubmit || isReactivatingMetronomeContract;
  const periodEndLabel = invoice
    ? formatTimestampToFriendlyDate(invoice.currentPeriodEndMs, "short")
    : null;
  const subscriptionEndLabel = subscriptionEndsAtMs
    ? formatTimestampToFriendlyDate(subscriptionEndsAtMs, "short")
    : null;

  return (
    <SubscriptionContext.Provider
      value={{
        owner,
        subscription,
        invoice,
        isMetronomeInvoiceLoading,
        isCancellablePlan,
        isCancellationScheduled,
        subscriptionEndsAtMs,
        subscriptionStatus,
        canCancelSubscription,
        canReactivateSubscription,
        isCancellingSubscription,
        isReactivatingSubscription,
        periodEndLabel,
        subscriptionEndLabel,
        showCancelDialog,
        setShowCancelDialog,
        showReactivateDialog,
        setShowReactivateDialog,
        cancelSubscription,
        reactivateSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}
