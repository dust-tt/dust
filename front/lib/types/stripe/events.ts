import type Stripe from "stripe";

type StripeSubscriptionEvent =
  | Stripe.CustomerSubscriptionCreatedEvent
  | Stripe.CustomerSubscriptionDeletedEvent
  | Stripe.CustomerSubscriptionPausedEvent
  | Stripe.CustomerSubscriptionPendingUpdateAppliedEvent
  | Stripe.CustomerSubscriptionPendingUpdateExpiredEvent
  | Stripe.CustomerSubscriptionResumedEvent
  | Stripe.CustomerSubscriptionTrialWillEndEvent
  | Stripe.CustomerSubscriptionUpdatedEvent;

type StripeInvoiceEvent =
  | Stripe.InvoiceCreatedEvent
  | Stripe.InvoiceDeletedEvent
  | Stripe.InvoiceFinalizationFailedEvent
  | Stripe.InvoiceFinalizedEvent
  | Stripe.InvoiceMarkedUncollectibleEvent
  | Stripe.InvoicePaidEvent
  | Stripe.InvoicePaymentActionRequiredEvent
  | Stripe.InvoicePaymentFailedEvent
  | Stripe.InvoicePaymentSucceededEvent
  | Stripe.InvoiceSentEvent
  | Stripe.InvoiceUpcomingEvent
  | Stripe.InvoiceUpdatedEvent
  | Stripe.InvoiceVoidedEvent;

export function isStripeSubscriptionEvent(
  event: Stripe.Event
): event is StripeSubscriptionEvent {
  return event.type.startsWith("customer.subscription.");
}

export function isStripeInvoiceEvent(
  event: Stripe.Event
): event is StripeInvoiceEvent {
  return event.type.startsWith("invoice.");
}
