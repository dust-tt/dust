import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { CouponModel } from "@app/lib/resources/storage/models/coupons";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  CROSS_WORKSPACE_RESOURCES_WORKSPACE_ID,
  getResourceIdFromSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { CouponType, CreateCouponBody } from "@app/types/coupon";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, ModelStatic, Transaction } from "sequelize";
import { Op } from "sequelize";

export type CouponValidationError =
  | { code: "expired"; expirationDate: Date }
  | { code: "exhausted"; maxRedemptions: number }
  | { code: "archived" }
  | { code: "already_redeemed" };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CouponResource extends ReadonlyAttributesType<CouponModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CouponResource extends BaseResource<CouponModel> {
  static model: ModelStatic<CouponModel> = CouponModel;

  constructor(_: ModelStatic<CouponModel>, blob: Attributes<CouponModel>) {
    super(CouponModel, blob);
  }

  get sId(): string {
    return CouponResource.modelIdToSId({ id: this.id });
  }

  static modelIdToSId({ id }: { id: ModelId }): string {
    return makeSId("coupon", {
      id,
      workspaceId: CROSS_WORKSPACE_RESOURCES_WORKSPACE_ID,
    });
  }

  static async makeNew(
    auth: Authenticator,
    body: CreateCouponBody,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<CouponResource, Error>> {
    try {
      const user = auth.getNonNullableUser();
      const coupon = await CouponModel.create(
        {
          ...body,
          discountType: "seat",
          createdByUserId: user.id,
        },
        { transaction }
      );
      return new Ok(new this(this.model, coupon.get()));
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  static async findByCode(code: string): Promise<CouponResource | null> {
    const row = await CouponModel.findOne({ where: { code } });
    return row ? new this(this.model, row.get()) : null;
  }

  static async fetchByCouponId(
    couponId: string
  ): Promise<CouponResource | null> {
    const id = getResourceIdFromSId(couponId);
    if (!id) {
      return null;
    }
    return this.fetchByModelId(id);
  }

  static async listAll({
    includeArchived = false,
  }: {
    includeArchived?: boolean;
  } = {}): Promise<CouponResource[]> {
    const rows = await CouponModel.findAll({
      where: includeArchived ? {} : { archivedAt: { [Op.is]: null } },
      order: [["createdAt", "DESC"]],
    });
    return rows.map((r) => new this(this.model, r.get()));
  }

  async archive(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<void, Error>> {
    try {
      await this.update({ archivedAt: new Date() }, transaction);
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  validateRedemption(): Result<void, CouponValidationError> {
    if (this.archivedAt) {
      return new Err({ code: "archived" });
    }

    if (this.expirationDate && this.expirationDate < new Date()) {
      return new Err({ code: "expired", expirationDate: this.expirationDate });
    }

    if (
      this.maxRedemptions !== null &&
      this.redemptionCount >= this.maxRedemptions
    ) {
      return new Err({
        code: "exhausted",
        maxRedemptions: this.maxRedemptions,
      });
    }

    return new Ok(undefined);
  }

  async incrementRedemptionCount({
    transaction,
  }: {
    transaction?: Transaction;
  } = {}): Promise<void> {
    await CouponModel.increment("redemptionCount", {
      by: 1,
      where: { id: this.id },
      transaction,
    });
  }

  async decrementRedemptionCount({
    transaction,
  }: {
    transaction?: Transaction;
  } = {}): Promise<void> {
    await CouponModel.increment("redemptionCount", {
      by: -1,
      where: { id: this.id },
      transaction,
    });
  }

  toJSON(): CouponType {
    return {
      sId: this.sId,
      code: this.code,
      description: this.description,
      discountType: this.discountType,
      amount: this.amount,
      durationMonths: this.durationMonths,
      maxRedemptions: this.maxRedemptions,
      redemptionCount: this.redemptionCount,
      expirationDate: this.expirationDate,
      archivedAt: this.archivedAt,
    };
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await CouponModel.destroy({ where: { id: this.id }, transaction });
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  toLogJSON() {
    return { id: this.id, sId: this.sId, code: this.code };
  }
}
