import { useSubscriptionContext } from "@app/components/workspace/billing/SubscriptionContext";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import {
  Button,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";

function CancelMetronomeSubscriptionDialog() {
  const {
    periodEndLabel,
    isCancellingSubscription,
    cancelSubscription,
    showCancelDialog,
    setShowCancelDialog,
  } = useSubscriptionContext();
  // "July 12, 2026" → "July 12"
  const shortDate = periodEndLabel ? periodEndLabel.split(",")[0] : null;

  return (
    <Dialog
      open={showCancelDialog}
      onOpenChange={(open) => {
        if (!open) {
          setShowCancelDialog(false);
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Cancel your subscription</DialogTitle>
          <DialogDescription>
            {periodEndLabel ? (
              <>
                Your plan will remain active until{" "}
                <span className="font-bold">{periodEndLabel}</span>.
              </>
            ) : (
              "Your plan will remain active until the end of the current billing period."
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          {isCancellingSubscription ? (
            <div className="flex justify-center py-8">
              <Spinner variant="dark" size="md" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {periodEndLabel && (
                <ContentMessage size="sm" variant="highlight">
                  You can resume your subscription any time before{" "}
                  {periodEndLabel} with no interruption to your plan.
                </ContentMessage>
              )}
              <div className="flex flex-col gap-3">
                <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
                  What happens next
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
                      {shortDate
                        ? `Until ${shortDate}`
                        : "Until your plan ends"}
                    </div>
                    <div className="text-sm text-muted-foreground ark:text-muted-foreground-night">
                      Everything works exactly as it does today. You keep full
                      access to your workspace.
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
                      {shortDate
                        ? `After ${shortDate}`
                        : "After your plan ends"}
                    </div>
                    <div className="text-sm text-muted-foreground ark:text-muted-foreground-night">
                      Your workspace becomes read-only. Members keep their
                      accounts and can still sign in to view content.
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
                      Your data
                    </div>
                    <div className="text-sm text-muted-foreground ark:text-muted-foreground-night">
                      Agents, conversations, and connected data sources are
                      preserved for 30 days. Reactivate any time during that
                      window.
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
                      Invoices
                    </div>
                    <div className="text-sm text-muted-foreground ark:text-muted-foreground-night">
                      Past invoices remain available indefinitely from this
                      page.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Keep my subscription",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Cancel Subscription",
            variant: "warning",
            onClick: cancelSubscription,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReactivateMetronomeSubscriptionDialog() {
  const {
    subscriptionEndLabel,
    isReactivatingSubscription,
    reactivateSubscription,
    showReactivateDialog,
    setShowReactivateDialog,
  } = useSubscriptionContext();
  return (
    <Dialog
      open={showReactivateDialog}
      onOpenChange={(open) => {
        if (!open) {
          setShowReactivateDialog(false);
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Resume your subscription</DialogTitle>
          <DialogDescription>
            {subscriptionEndLabel ? (
              <>
                Your plan is scheduled to end on{" "}
                <span className="font-bold">{subscriptionEndLabel}</span>.
                Resuming now keeps everything active without interruption.
              </>
            ) : (
              "Resuming your subscription will keep everything active without interruption."
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          {isReactivatingSubscription ? (
            <div className="flex justify-center py-8">
              <Spinner variant="dark" size="md" />
            </div>
          ) : (
            <ContentMessage size="sm" variant="highlight">
              Your billing cycle will continue as normal and you will not be
              charged again until the next billing date.
            </ContentMessage>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Resume subscription",
            variant: "highlight",
            onClick: reactivateSubscription,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

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
