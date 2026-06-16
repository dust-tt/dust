import {
  CancelMetronomeSubscriptionDialog,
  ReactivateMetronomeSubscriptionDialog,
} from "@app/components/pages/workspace/subscription/MetronomeSubscriptionPanel";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { Button } from "@dust-tt/sparkle";
import { useSubscriptionContext } from "./SubscriptionContext";

export function SubscriptionActionButtons() {
  const {
    canCancelSubscription,
    canReactivateSubscription,
    isCancellingSubscription,
    isReactivatingSubscription,
    setShowCancelDialog,
    setShowReactivateDialog,
  } = useSubscriptionContext();

  return (
    <>
      <CancelMetronomeSubscriptionDialog />
      <ReactivateMetronomeSubscriptionDialog />
      {canReactivateSubscription ? (
        <Button
          label="Resume subscription"
          size="sm"
          variant="highlight"
          disabled={isReactivatingSubscription}
          onClick={withTracking(
            TRACKING_AREAS.AUTH,
            "subscription_reactivate",
            () => {
              setShowReactivateDialog(true);
            }
          )}
        />
      ) : canCancelSubscription ? (
        <Button
          label="Cancel subscription"
          size="sm"
          variant="outline"
          disabled={isCancellingSubscription}
          onClick={withTracking(
            TRACKING_AREAS.AUTH,
            "subscription_cancel",
            () => {
              setShowCancelDialog(true);
            }
          )}
        />
      ) : null}
    </>
  );
}
