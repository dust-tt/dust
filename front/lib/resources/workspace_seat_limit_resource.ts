import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { WorkspaceSeatLimitModel } from "@app/lib/resources/storage/models/workspace_seat_limit";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { MembershipSeatType } from "@app/types/memberships";
import { isMembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

/**
 * The min/max seat configuration for a single seat type. `maxSeats === null`
 * means the seat type is uncapped.
 */
export type SeatLimit = {
  minSeats: number;
  maxSeats: number | null;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface WorkspaceSeatLimitResource
  extends ReadonlyAttributesType<WorkspaceSeatLimitModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WorkspaceSeatLimitResource extends BaseResource<WorkspaceSeatLimitModel> {
  static model: ModelStaticWorkspaceAware<WorkspaceSeatLimitModel> =
    WorkspaceSeatLimitModel;

  constructor(
    model: ModelStatic<WorkspaceSeatLimitModel>,
    blob: Attributes<WorkspaceSeatLimitModel>
  ) {
    super(WorkspaceSeatLimitModel, blob);
  }

  /**
   * Returns the configured per-seat-type min/max for a workspace, keyed by
   * seat type. Seat types without a row are simply absent from the map
   * (callers treat that as "no min, no max").
   */
  static async fetchByWorkspace({
    workspace,
  }: {
    workspace: LightWorkspaceType;
  }): Promise<Map<MembershipSeatType, SeatLimit>> {
    const rows = await this.model.findAll({
      where: { workspaceId: workspace.id },
    });
    const result = new Map<MembershipSeatType, SeatLimit>();
    for (const row of rows) {
      if (isMembershipSeatType(row.seatType)) {
        result.set(row.seatType, {
          minSeats: row.minSeats,
          maxSeats: row.maxSeats,
        });
      }
    }
    return result;
  }

  /**
   * Create or update the min/max configuration for a (workspace, seat type).
   * Used by seeding scripts / poke — there is no end-user API for this yet.
   */
  static async upsert({
    workspace,
    seatType,
    minSeats,
    maxSeats,
    transaction,
  }: {
    workspace: LightWorkspaceType;
    seatType: MembershipSeatType;
    minSeats: number;
    maxSeats: number | null;
    transaction?: Transaction;
  }): Promise<void> {
    const existing = await this.model.findOne({
      where: { workspaceId: workspace.id, seatType },
      transaction,
    });
    if (existing) {
      await existing.update({ minSeats, maxSeats }, { transaction });
      return;
    }
    await this.model.create(
      { workspaceId: workspace.id, seatType, minSeats, maxSeats },
      { transaction }
    );
  }

  /**
   * Remove the configured limit for a (workspace, seat type). Returns whether
   * a row was actually deleted. Used by the poke plugin to "disable" a limit.
   */
  static async remove({
    workspace,
    seatType,
    transaction,
  }: {
    workspace: LightWorkspaceType;
    seatType: MembershipSeatType;
    transaction?: Transaction;
  }): Promise<boolean> {
    const deletedCount = await this.model.destroy({
      where: { workspaceId: workspace.id, seatType },
      transaction,
    });
    return deletedCount > 0;
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await WorkspaceSeatLimitModel.destroy({
        where: { id: this.id, workspaceId: auth.getNonNullableWorkspace().id },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }
}
