import type Stripe from "stripe";

export function shouldSyncTrialingCancellationFromPreviousAttributes(
  previousAttributes: Stripe.Event.Data.PreviousAttributes
): boolean {
  return (
    "cancel_at_period_end" in previousAttributes ||
    "cancel_at" in previousAttributes ||
    "canceled_at" in previousAttributes ||
    "cancellation_details" in previousAttributes
  );
}

export function getCancelAtDateFromStripeSubscription(
  stripeSubscription: Stripe.Subscription
): Date | null {
  return typeof stripeSubscription.cancel_at === "number"
    ? new Date(stripeSubscription.cancel_at * 1000)
    : null;
}

export function computeTrialingCancellationUpdateFromStripe({
  stripeSubscription,
  previousAttributes,
  now,
}: {
  stripeSubscription: Stripe.Subscription;
  previousAttributes: Stripe.Event.Data.PreviousAttributes;
  now: Date;
}): { endDate: Date | null; requestCancelAt: Date | null } | null {
  if (stripeSubscription.status !== "trialing") {
    return null;
  }

  if (!shouldSyncTrialingCancellationFromPreviousAttributes(previousAttributes)) {
    return null;
  }

  const endDate = getCancelAtDateFromStripeSubscription(stripeSubscription);
  return { endDate, requestCancelAt: endDate ? now : null };
}

