import { z } from "zod";

// Base paid seat types for the self-serve checkout flow.
// "pro" and "max" only — the yearly variant is expressed by billingPeriod,
// not by the seat type (unlike MembershipSeatType which has "pro_yearly" etc.).
export const CHECKOUT_SEAT_TYPES = ["pro", "max"] as const;
export type CheckoutSeatType = (typeof CHECKOUT_SEAT_TYPES)[number];
export const CheckoutSeatTypeSchema = z.enum(CHECKOUT_SEAT_TYPES);

export const CHECKOUT_BILLING_PERIODS = ["monthly", "yearly"] as const;
export type CheckoutBillingPeriod = (typeof CHECKOUT_BILLING_PERIODS)[number];
export const CheckoutBillingPeriodSchema = z.enum(CHECKOUT_BILLING_PERIODS);
