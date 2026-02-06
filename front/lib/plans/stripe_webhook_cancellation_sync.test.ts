import { describe, expect, it } from "vitest";

import {
  computeTrialingCancellationUpdateFromStripe,
  getCancelAtDateFromStripeSubscription,
  shouldSyncTrialingCancellationFromPreviousAttributes,
} from "@app/lib/plans/stripe_webhook_cancellation_sync";

describe("stripe_webhook_cancellation_sync", () => {
  it("detects trialing cancellation fields in previous_attributes", () => {
    expect(
      shouldSyncTrialingCancellationFromPreviousAttributes({
        cancel_at_period_end: true,
      } as any)
    ).toBe(true);
    expect(
      shouldSyncTrialingCancellationFromPreviousAttributes({
        default_payment_method: "pm_123",
      } as any)
    ).toBe(false);
  });

  it("maps cancel_at to a Date", () => {
    const date = getCancelAtDateFromStripeSubscription({
      cancel_at: 1000,
    } as any);
    expect(date?.toISOString()).toBe("1970-01-01T00:16:40.000Z");
  });

  it("returns null when not trialing", () => {
    const update = computeTrialingCancellationUpdateFromStripe({
      stripeSubscription: { status: "active" } as any,
      previousAttributes: { cancel_at_period_end: true } as any,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(update).toBeNull();
  });

  it("computes endDate when cancellation is scheduled during trial", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const update = computeTrialingCancellationUpdateFromStripe({
      stripeSubscription: { status: "trialing", cancel_at: 123 } as any,
      previousAttributes: { cancel_at_period_end: true } as any,
      now,
    });
    expect(update?.endDate?.toISOString()).toBe("1970-01-01T00:02:03.000Z");
    expect(update?.requestCancelAt?.toISOString()).toBe(now.toISOString());
  });

  it("clears endDate when cancellation is removed during trial", () => {
    const update = computeTrialingCancellationUpdateFromStripe({
      stripeSubscription: { status: "trialing", cancel_at: null } as any,
      previousAttributes: { cancel_at_period_end: true, cancel_at: 123 } as any,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(update).toEqual({ endDate: null, requestCancelAt: null });
  });
});

