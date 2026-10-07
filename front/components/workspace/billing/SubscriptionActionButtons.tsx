import { useSubscriptionContext } from "@app/components/workspace/billing/SubscriptionContext";
import { isCreditPricedFreePlan } from "@app/lib/plans/plan_codes";
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
import { Trans, useLingui } from "@lingui/react/macro";

function CancelMetronomeSubscriptionDialog() {
  const { t } = useLingui();
  const {
    subscription,
    periodEndLabel,
    isCancellingSubscription,
    cancelSubscription,
    showCancelDialog,
    setShowCancelDialog,
  } = useSubscriptionContext();
  const isImmediateCancellation = isCreditPricedFreePlan(
    subscription.plan.code
  );
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
          <DialogTitle>
            <Trans>Cancel your subscription</Trans>
          </DialogTitle>
          <DialogDescription>
            {isImmediateCancellation ? (
              <Trans>Your subscription will end immediately.</Trans>
            ) : periodEndLabel ? (
              <Trans>
                Your plan will remain active until{" "}
                <span className="font-bold">{periodEndLabel}</span>.
              </Trans>
            ) : (
              <Trans>
                Your plan will remain active until the end of the current
                billing period.
              </Trans>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          {isCancellingSubscription ? (
            <div className="flex justify-center py-8">
              <Spinner variant="dark" size="md" />
            </div>
          ) : isImmediateCancellation ? (
            <ContentMessage size="sm" variant="highlight">
              <Trans>
                This ends your subscription right away and cannot be undone.
              </Trans>
            </ContentMessage>
          ) : (
            <div className="flex flex-col gap-4">
              {periodEndLabel && (
                <ContentMessage size="sm" variant="highlight">
                  <Trans>
                    You can resume your subscription any time before{" "}
                    {periodEndLabel} with no interruption to your plan.
                  </Trans>
                </ContentMessage>
              )}
              <div className="flex flex-col gap-3">
                <div className="text-sm font-semibold text-foreground">
                  <Trans>What happens next</Trans>
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {shortDate
                        ? t`Until ${shortDate}`
                        : t`Until your plan ends`}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <Trans>
                        Everything works exactly as it does today. You keep full
                        access to your workspace.
                      </Trans>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {shortDate
                        ? t`After ${shortDate}`
                        : t`After your plan ends`}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <Trans>
                        Your workspace becomes read-only. Members keep their
                        accounts and can still sign in to view content.
                      </Trans>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      <Trans>Your data</Trans>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <Trans>
                        Agents, conversations, and connected data sources are
                        preserved for 30 days. Reactivate any time during that
                        window.
                      </Trans>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      <Trans>Invoices</Trans>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <Trans>
                        Past invoices remain available indefinitely from this
                        page.
                      </Trans>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: t`Keep my subscription`,
            variant: "outline",
          }}
          rightButtonProps={{
            label: t`Cancel subscription`,
            variant: "warning",
            onClick: cancelSubscription,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReactivateMetronomeSubscriptionDialog() {
  const { t } = useLingui();
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
          <DialogTitle>
            <Trans>Resume your subscription</Trans>
          </DialogTitle>
          <DialogDescription>
            {subscriptionEndLabel ? (
              <Trans>
                Your plan is scheduled to end on{" "}
                <span className="font-bold">{subscriptionEndLabel}</span>.
                Resuming now keeps everything active without interruption.
              </Trans>
            ) : (
              <Trans>
                Resuming your subscription will keep everything active without
                interruption.
              </Trans>
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
              <Trans>
                Your billing cycle will continue as normal and you will not be
                charged again until the next billing date.
              </Trans>
            </ContentMessage>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
          }}
          rightButtonProps={{
            label: t`Resume subscription`,
            variant: "highlight",
            onClick: reactivateSubscription,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function SubscriptionActionButtons() {
  const { t } = useLingui();
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
          label={t`Resume subscription`}
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
          label={t`Cancel subscription`}
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
