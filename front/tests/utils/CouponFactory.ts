import { CouponResource } from "@app/lib/resources/coupon_resource";
import { CouponModel } from "@app/lib/resources/storage/models/coupons";
import { faker } from "@faker-js/faker";

interface CouponOverrides {
  code?: string;
  discountType?: "fixed" | "usage_credit";
  amountMicroUsd?: number;
  creditTypeId?: string;
  maxRedemptions?: number | null;
  redemptionCount?: number;
  redeemBy?: Date | null;
  archivedAt?: Date | null;
  durationMonths?: number | null;
  description?: string | null;
}

export class CouponFactory {
  static async create(
    overrides: CouponOverrides = {}
  ): Promise<CouponResource> {
    const row = await CouponModel.create({
      code: overrides.code ?? faker.string.alphanumeric(8).toUpperCase(),
      description: overrides.description ?? null,
      discountType: overrides.discountType ?? "fixed",
      amountMicroUsd: overrides.amountMicroUsd ?? 10_000_000,
      creditTypeId: overrides.creditTypeId ?? faker.string.uuid(),
      durationMonths: overrides.durationMonths ?? null,
      maxRedemptions: overrides.maxRedemptions ?? null,
      redemptionCount: overrides.redemptionCount ?? 0,
      redeemBy: overrides.redeemBy ?? null,
      archivedAt: overrides.archivedAt ?? null,
      createdByUserId: null,
    });
    return new CouponResource(CouponResource.model, row.get());
  }
}
