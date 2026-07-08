import type { SupportedCurrency } from "@app/types/currency";

// Statuses surfaced to workspace admins in the Billing > Coupons tab. Pending
// and failed redemptions are internal transient states and are not exposed.
export type WorkspaceCouponStatus = "active" | "revoked";

// One consumption of a seat coupon credit: the (negative) deduction applied to
// an invoice for a billing period, surfaced as a positive amount.
export interface SeatCouponConsumptionData {
  timestampMs: number;
  amountCents: number;
}

export interface SeatCouponData {
  discountType: "seat";
  redemptionId: string;
  code: string;
  status: WorkspaceCouponStatus;
  redeemedAtMs: number;
  totalAmountCents: number;
  remainingAmountCents: number;
  currency: SupportedCurrency;
  consumptions: SeatCouponConsumptionData[];
}

// For "credit_pool_top_up" coupons the amount is in AWU credits (currency
// independent) and consumption is tracked in the shared workspace pool, so
// only the redeemed amount is surfaced.
export interface CreditPoolTopUpCouponData {
  discountType: "credit_pool_top_up";
  redemptionId: string;
  code: string;
  status: WorkspaceCouponStatus;
  redeemedAtMs: number;
  amountCredits: number;
}

export type WorkspaceCouponData = SeatCouponData | CreditPoolTopUpCouponData;

export interface GetWorkspaceCouponsResponseBody {
  coupons: WorkspaceCouponData[];
}
