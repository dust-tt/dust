import { CouponResource } from "@app/lib/resources/coupon_resource";
import { CouponModel } from "@app/lib/resources/storage/models/coupons";
import { faker } from "@faker-js/faker";

interface CouponOverrides {
  code?: string;
  amount?: number;
  maxRedemptions?: number | null;
  redemptionCount?: number;
  expirationDate?: Date | null;
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
      discountType: "seat",
      amount: overrides.amount ?? 10.0,
      durationMonths: overrides.durationMonths ?? null,
      maxRedemptions: overrides.maxRedemptions ?? null,
      redemptionCount: overrides.redemptionCount ?? 0,
      expirationDate: overrides.expirationDate ?? null,
      archivedAt: overrides.archivedAt ?? null,
      createdByUserId: null,
    });
    return new CouponResource(CouponResource.model, row.get());
  }
}
