import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { CouponResource } from "@app/lib/resources/coupon_resource";
import { CouponRedemptionModel } from "@app/lib/resources/storage/models/coupon_redemptions";
import { CouponModel } from "@app/lib/resources/storage/models/coupons";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { CouponRedemptionType } from "@app/types/coupon";
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
  static model: ModelStatic<CouponRedemptionModel> = CouponRedemptionModel;

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
    const [redemption] = await Promise.all([
      CouponRedemptionModel.create(
        {
          couponId: coupon.id,
          workspaceId: workspace.id,
          redeemedByUserId: auth.user()?.id ?? null,
          redeemedAt: new Date(),
        },
        { transaction }
      ),
      CouponModel.increment("redemptionCount", {
        by: 1,
        where: { id: coupon.id },
        transaction,
      }),
    ]);
    return new this(this.model, redemption.get(), {
      workspaceSId: workspace.sId,
      couponSId: coupon.sId,
      redeemedByUserSId: auth.user()?.sId ?? null,
    });
  }

  static async listAllByCoupon(
    coupon: CouponResource
  ): Promise<CouponRedemptionResource[]> {
    // WORKSPACE_ISOLATION_BYPASS: Poke global view — listing all redemptions
    // across workspaces for a single coupon for admin visibility.
    const rows = await (
      CouponRedemptionModel as ModelStaticWorkspaceAware<CouponRedemptionModel>
    ).findAll({
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
    const workspaces = await WorkspaceModel.findAll({
      where: { id: uniqueWorkspaceIds },
    });
    const workspaceSIdById = new Map(workspaces.map((w) => [w.id, w.sId]));

    return rows.map((r) => {
      const plain = r.get({
        plain: true,
      }) as Attributes<CouponRedemptionModel> & {
        redeemedByUser: Attributes<UserModel> | null;
      };
      return new this(this.model, r.get(), {
        workspaceSId: workspaceSIdById.get(r.workspaceId) ?? "",
        couponSId: coupon.sId,
        redeemedByUserSId: plain.redeemedByUser?.sId ?? null,
      });
    });
  }

  toJSON(): CouponRedemptionType {
    return {
      sId: this.sId,
      couponId: this.couponSId,
      workspaceId: this.workspaceSId,
      redeemedByUserId: this.redeemedByUserSId,
      redeemedAt: this.redeemedAt,
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
