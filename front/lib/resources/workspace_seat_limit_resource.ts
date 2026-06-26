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
 * The seat configuration for a single seat type.
 *
 * - `minSeats`: billing floor (count billed to Metronome when actual headcount is lower).
 * - `maxSeats`: hard assignment cap; null means no cap.
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
   * Returns the configured per-seat-type limits for a workspace, keyed by seat
   * type. Seat types without a row are simply absent from the map (callers
   * treat that as "no floor / no cap").
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
          maxSeats: row.maxSeats ?? null,
        });
      }
    }
    return result;
  }

  /**
   * Create or update the configured limit for a (workspace, seat type).
   * Rejects when `maxSeats` is set and less than `minSeats`.
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
    maxSeats?: number | null;
    transaction?: Transaction;
  }): Promise<Result<void, Error>> {
    if (maxSeats !== null && maxSeats !== undefined && maxSeats < minSeats) {
      return new Err(
        new Error(
          `maxSeats (${maxSeats}) must be greater than or equal to minSeats (${minSeats}).`
        )
      );
    }
    const fields: {
      minSeats: number;
      maxSeats?: number | null;
    } = { minSeats };
    if (maxSeats !== undefined) {
      fields.maxSeats = maxSeats;
    }
    const existing = await this.model.findOne({
      where: { workspaceId: workspace.id, seatType },
      transaction,
    });
    if (existing) {
      await existing.update(fields, { transaction });
      return new Ok(undefined);
    }
    await this.model.create(
      { workspaceId: workspace.id, seatType, ...fields },
      { transaction }
    );
    return new Ok(undefined);
  }

  /**
   * Delete all seat-limit rows for a workspace. Called during workspace
   * deletion/scrubbing to satisfy the `ON DELETE RESTRICT` FK before the
   * workspace row itself is removed, and when a workspace loses its plan
   * (reset to FREE_NO_PLAN), where plan-level seat caps no longer apply.
   */
  static async deleteAllForWorkspace({
    workspace,
    transaction,
  }: {
    workspace: LightWorkspaceType;
    transaction?: Transaction;
  }): Promise<void> {
    await this.model.destroy({
      where: { workspaceId: workspace.id },
      transaction,
    });
  }

  /**
   * Remove the configured limit for a (workspace, seat type). Returns whether
   * a row was actually deleted.
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
