import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import { CouponRedemptionModel } from "@app/lib/resources/storage/models/coupon_redemptions";
import { CouponModel } from "@app/lib/resources/storage/models/coupons";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type {
  CouponRedemptionStatus,
  CouponRedemptionType,
} from "@app/types/coupon";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CouponRedemptionResource
  extends ReadonlyAttributesType<CouponRedemptionModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CouponRedemptionResource extends BaseResource<CouponRedemptionModel> {
  static model: ModelStaticWorkspaceAware<CouponRedemptionModel> =
    CouponRedemptionModel;

  readonly workspaceSId: string;
  readonly couponSId: string;
  readonly redeemedByUserSId: string | null;

  constructor(
    _: ModelStatic<CouponRedemptionModel>,
    blob: Attributes<CouponRedemptionModel>,
    {
      workspaceSId,
      couponSId,
      redeemedByUserSId,
    }: {
      workspaceSId: string;
      couponSId: string;
      redeemedByUserSId: string | null;
    }
  ) {
    super(CouponRedemptionModel, blob);
    this.workspaceSId = workspaceSId;
    this.couponSId = couponSId;
    this.redeemedByUserSId = redeemedByUserSId;
  }

  get sId(): string {
    return CouponRedemptionResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("coupon_redemption", { id, workspaceId });
  }

  static async makeNew(
    auth: Authenticator,
    { coupon }: { coupon: CouponResource },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<CouponRedemptionResource> {
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();
    const redemption = await CouponRedemptionModel.create(
      {
        couponId: coupon.id,
        workspaceId: workspace.id,
        redeemedByUserId: user.id,
        redeemedAt: new Date(),
        status: "pending",
        metronomeCreditIds: [],
      },
      { transaction }
    );
    return new this(this.model, redemption.get(), {
      workspaceSId: workspace.sId,
      couponSId: coupon.sId,
      redeemedByUserSId: user.sId,
    });
  }

  static async findActiveOrPendingByCouponAndWorkspace(
    auth: Authenticator,
    { coupon }: { coupon: CouponResource }
  ): Promise<CouponRedemptionResource | null> {
    const workspace = auth.getNonNullableWorkspace();
    const row = await this.model.findOne({
      where: {
        couponId: coupon.id,
        workspaceId: workspace.id,
        status: ["pending", "active"],
      },
    });
    if (!row) {
      return null;
    }
    return new this(this.model, row.get(), {
      workspaceSId: workspace.sId,
      couponSId: coupon.sId,
      redeemedByUserSId: null,
    });
  }

  static async listActiveByWorkspace(
    auth: Authenticator
  ): Promise<
    Array<{ redemption: CouponRedemptionResource; couponCode: string }>
  > {
    const workspace = auth.getNonNullableWorkspace();
    const rows = await this.model.findAll({
      where: { workspaceId: workspace.id, status: "active" },
      include: [
        { model: CouponModel, as: "coupon", required: true },
        { model: UserModel, as: "redeemedByUser", required: false },
      ],
      order: [["redeemedAt", "DESC"]],
    });
    return rows.map((r) => ({
      redemption: new this(this.model, r.get(), {
        workspaceSId: workspace.sId,
        couponSId: CouponResource.modelIdToSId({ id: r.couponId }),
        redeemedByUserSId: r.redeemedByUser?.sId ?? null,
      }),
      couponCode: r.coupon.code,
    }));
  }

  static async fetchById(
    auth: Authenticator,
    redemptionId: string
  ): Promise<CouponRedemptionResource | null> {
    const workspace = auth.getNonNullableWorkspace();
    const id = getResourceIdFromSId(redemptionId);
    if (!id) {
      return null;
    }
    const row = await this.model.findOne({
      where: { id, workspaceId: workspace.id },
      include: [{ model: UserModel, as: "redeemedByUser", required: false }],
    });
    if (!row) {
      return null;
    }
    return new this(this.model, row.get(), {
      workspaceSId: workspace.sId,
      couponSId: CouponResource.modelIdToSId({ id: row.couponId }),
      redeemedByUserSId: row.redeemedByUser?.sId ?? null,
    });
  }

  static async listAllByCoupon(
    coupon: CouponResource
  ): Promise<CouponRedemptionResource[]> {
    // WORKSPACE_ISOLATION_BYPASS: Poke global view — listing all redemptions
    // across workspaces for a single coupon for admin visibility.
    const rows = await this.model.findAll({
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      where: { couponId: coupon.id },
      include: [{ model: UserModel, as: "redeemedByUser", required: false }],
      order: [["redeemedAt", "DESC"]],
    });

    if (rows.length === 0) {
      return [];
    }

    const uniqueWorkspaceIds = [...new Set(rows.map((r) => r.workspaceId))];
    const workspaces =
      await WorkspaceResource.fetchByModelIds(uniqueWorkspaceIds);
    const workspaceSIdById = new Map(workspaces.map((w) => [w.id, w.sId]));

    return rows.map(
      (r) =>
        new this(this.model, r.get(), {
          workspaceSId: workspaceSIdById.get(r.workspaceId) ?? "",
          couponSId: coupon.sId,
          redeemedByUserSId: r.redeemedByUser?.sId ?? null,
        })
    );
  }

  private async applyStatusUpdate(
    fields: { status: CouponRedemptionStatus; metronomeCreditIds?: string[] },
    transaction?: Transaction
  ): Promise<Result<void, Error>> {
    try {
      await this.update(fields, transaction);
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  async markActive(
    creditIds: string[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<void, Error>> {
    return this.applyStatusUpdate(
      { status: "active", metronomeCreditIds: creditIds },
      transaction
    );
  }

  async markFailed({
    transaction,
  }: {
    transaction?: Transaction;
  } = {}): Promise<Result<void, Error>> {
    return this.applyStatusUpdate({ status: "failed" }, transaction);
  }

  async markRevoked({
    transaction,
  }: {
    transaction?: Transaction;
  } = {}): Promise<Result<void, Error>> {
    return this.applyStatusUpdate({ status: "revoked" }, transaction);
  }

  toJSON(): CouponRedemptionType {
    return {
      sId: this.sId,
      couponId: this.couponSId,
      workspaceId: this.workspaceSId,
      redeemedByUserId: this.redeemedByUserSId,
      redeemedAt: this.redeemedAt,
      metronomeCreditIds: this.metronomeCreditIds,
      status: this.status,
    };
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await CouponRedemptionModel.destroy({
        where: { id: this.id, workspaceId: auth.getNonNullableWorkspace().id },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  toLogJSON() {
    return {
      id: this.id,
      sId: this.sId,
      couponSId: this.couponSId,
      workspaceSId: this.workspaceSId,
    };
  }
}
