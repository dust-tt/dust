import { z } from "zod";

export type CouponDiscountType = "seat";

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

export const CouponDiscountTypeSchema = z.enum(["seat"]);

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
