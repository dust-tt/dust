import { z } from "zod";

export type CouponDiscountType = "fixed" | "usage_credit";

export interface CouponType {
  sId: string;
  code: string;
  description: string | null;
  discountType: CouponDiscountType;
  amountMicroUsd: number;
  creditTypeId: string;
  durationMonths: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  redeemBy: Date | null;
  archivedAt: Date | null;
}

export interface CouponRedemptionType {
  sId: string;
  couponId: string;
  workspaceId: string;
  redeemedByUserId: string | null;
  redeemedAt: Date;
}

export const CouponDiscountTypeSchema = z.enum(["fixed", "usage_credit"]);

export const CreateCouponBodySchema = z.object({
  code: z.string().min(1).max(64),
  description: z.string().max(255).nullable(),
  discountType: CouponDiscountTypeSchema,
  amountMicroUsd: z.number().int().positive(),
  creditTypeId: z.string().min(1),
  durationMonths: z.number().int().positive().nullable(),
  maxRedemptions: z.number().int().positive().nullable(),
  redeemBy: z.coerce.date().nullable(),
});

export type CreateCouponBody = z.infer<typeof CreateCouponBodySchema>;
