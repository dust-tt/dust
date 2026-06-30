import { z } from "zod";

// "seat" — discounts the monthly seat subscription price at checkout.
// "credit_pool_top_up" — grants bonus AWU credits to the workspace credit pool.
// For a "credit_pool_top_up" coupon, `amount` is expressed directly in AWU
// credits (not in currency / cents), because AWU is a currency-independent unit.
export type CouponDiscountType = "seat" | "credit_pool_top_up";

// Context in which a coupon is being redeemed. Maps 1:1 to `CouponDiscountType`
// ("seat" coupons apply to the "subscription" context, "credit_pool_top_up"
// coupons to the "credits" / Top-Up context) but is named after the redemption
// flow rather than the discount mechanic.
export type CouponRedemptionContext = "subscription" | "credits";

export type CouponRedemptionStatus =
  | "pending"
  | "failed"
  | "active"
  | "revoked";

export interface CouponType {
  sId: string;
  code: string;
  description: string | null;
  discountType: CouponDiscountType;
  amount: number;
  durationMonths: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  expirationDate: Date | null;
  archivedAt: Date | null;
}

export interface CouponRedemptionType {
  sId: string;
  couponId: string;
  workspaceId: string;
  redeemedByUserId: string | null;
  redeemedAt: Date;
  metronomeCreditIds: string[];
  status: CouponRedemptionStatus;
}

export const CouponDiscountTypeSchema = z.enum(["seat", "credit_pool_top_up"]);

export const CreateCouponBodySchema = z.object({
  code: z.string().min(1).max(64),
  description: z.string().max(255).nullable(),
  discountType: CouponDiscountTypeSchema,
  amount: z.number().positive(),
  durationMonths: z.number().int().positive().nullable(),
  maxRedemptions: z.number().int().positive().nullable(),
  expirationDate: z.coerce.date().nullable(),
});

export type CreateCouponBody = z.infer<typeof CreateCouponBodySchema>;
