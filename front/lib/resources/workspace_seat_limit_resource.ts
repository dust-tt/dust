import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { Op } from "@app/lib/resources/storage/data_types";
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

/**
 * A {@link SeatLimit} together with the `[startAt, endAt)` window over which it
 * applies (`endAt` null means open-ended). Returned by
 * {@link WorkspaceSeatLimitResource.fetchScheduleByWorkspace} so callers can
 * reason about scheduled future changes, not just the value effective now.
 */
export type SeatLimitSegment = SeatLimit & {
  startAt: Date;
  endAt: Date | null;
};

// Metronome effective dates must land on a whole UTC hour, so every scheduled
// seat-limit window is floored to the top of the hour here — regardless of what
// callers pass. Flooring epoch ms to an hour boundary yields a whole UTC hour.
const HOUR_MS = 3_600_000;
function floorToHourUTC(date: Date): Date {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

function validateMaxSeats({
  minSeats,
  maxSeats,
}: {
  minSeats: number;
  maxSeats?: number | null;
}): Result<void, Error> {
  if (maxSeats !== null && maxSeats !== undefined && maxSeats < minSeats) {
    return new Err(
      new Error(
        `maxSeats (${maxSeats}) must be greater than or equal to minSeats (${minSeats}).`
      )
    );
  }
  return new Ok(undefined);
}

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
   * Returns the per-seat-type limits that are active for a workspace at a given
   * point in time (defaults to now), keyed by seat type. A row is active when
   * `startAt <= at` and (`endAt` is null or `endAt > at`). Scheduled (future)
   * and historical (already ended) rows are ignored. Seat types without an
   * active row are simply absent from the map (callers treat that as "no floor
   * / no cap").
   */
  static async fetchByWorkspace({
    workspace,
    at = new Date(),
  }: {
    workspace: LightWorkspaceType;
    at?: Date;
  }): Promise<Map<MembershipSeatType, SeatLimit>> {
    const rows = await this.model.findAll({
      where: { workspaceId: workspace.id },
    });
    // The number of rows per workspace is small (a handful of seat types, each
    // with at most a few scheduled/historical rows), so we filter and pick the
    // active row in memory rather than pushing a time predicate into SQL.
    const activeByType = new Map<MembershipSeatType, WorkspaceSeatLimitModel>();
    for (const row of rows) {
      if (!isMembershipSeatType(row.seatType)) {
        continue;
      }
      if (row.startAt > at || (row.endAt !== null && row.endAt <= at)) {
        continue;
      }
      // Defensive: if several rows are active at once (should not happen), keep
      // the one that started most recently.
      const current = activeByType.get(row.seatType);
      if (!current || row.startAt > current.startAt) {
        activeByType.set(row.seatType, row);
      }
    }
    const result = new Map<MembershipSeatType, SeatLimit>();
    for (const [seatType, row] of activeByType) {
      result.set(seatType, {
        minSeats: row.minSeats,
        maxSeats: row.maxSeats ?? null,
      });
    }
    return result;
  }

  /**
   * Returns the currently-active and scheduled-future limits for a workspace,
   * keyed by seat type. Each seat type maps to its segments ordered by
   * `startAt` ascending: the active one (`startAt <= at`) followed by any
   * scheduled changes. Historical rows (already ended at `at`) are excluded.
   *
   * Use this when scheduled future changes matter (e.g. the Metronome seat sync
   * programs future-dated quantities); callers that only need the value
   * effective now should use {@link fetchByWorkspace}.
   */
  static async fetchScheduleByWorkspace({
    workspace,
    at = new Date(),
  }: {
    workspace: LightWorkspaceType;
    at?: Date;
  }): Promise<Map<MembershipSeatType, SeatLimitSegment[]>> {
    const rows = await this.model.findAll({
      where: { workspaceId: workspace.id },
    });
    const result = new Map<MembershipSeatType, SeatLimitSegment[]>();
    for (const row of rows) {
      if (!isMembershipSeatType(row.seatType)) {
        continue;
      }
      // Skip historical rows (already ended at `at`).
      if (row.endAt !== null && row.endAt <= at) {
        continue;
      }
      const bucket = result.get(row.seatType) ?? [];
      bucket.push({
        minSeats: row.minSeats,
        maxSeats: row.maxSeats ?? null,
        startAt: row.startAt,
        endAt: row.endAt ?? null,
      });
      result.set(row.seatType, bucket);
    }
    for (const bucket of result.values()) {
      bucket.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    }
    return result;
  }

  /**
   * Create or update the currently effective (open-ended) limit for a
   * (workspace, seat type). This is the "apply now" path: it targets the row
   * with `endAt === null` and leaves any scheduled or historical rows
   * untouched. Rejects when `maxSeats` is set and less than `minSeats`.
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
    const validation = validateMaxSeats({ minSeats, maxSeats });
    if (validation.isErr()) {
      return validation;
    }
    const fields: {
      minSeats: number;
      maxSeats?: number | null;
    } = { minSeats };
    if (maxSeats !== undefined) {
      fields.maxSeats = maxSeats;
    }
    const existing = await this.model.findOne({
      where: { workspaceId: workspace.id, seatType, endAt: null },
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
   * Set the seat limit for a (workspace, seat type) over the window
   * `[startAt, endAt)`. This is the general scheduling primitive behind the poke
   * "manage seat limits" tool:
   *
   * - Any existing rows that start at or after `startAt` are removed, so
   *   re-applying the same window is idempotent and a new schedule supersedes
   *   later ones.
   * - The currently open-ended row (if it starts before `startAt`) is end-dated
   *   at `startAt`, so the new row takes over cleanly and the single-open-ended
   *   invariant is preserved.
   * - A new row `[startAt, endAt)` is inserted. `endAt` null means open-ended;
   *   after a non-null `endAt` no floor/cap applies unless another row covers
   *   that time.
   *
   * Reading limits before `startAt` still returns the previous values; from
   * `startAt` (until `endAt`) the new values apply. Rejects when `maxSeats` is
   * set and less than `minSeats`, or when `endAt` is not after `startAt`.
   */
  static async setScheduledLimit({
    workspace,
    seatType,
    minSeats,
    maxSeats,
    startAt,
    endAt = null,
    transaction,
  }: {
    workspace: LightWorkspaceType;
    seatType: MembershipSeatType;
    minSeats: number;
    maxSeats?: number | null;
    startAt: Date;
    endAt?: Date | null;
    transaction?: Transaction;
  }): Promise<Result<void, Error>> {
    const validation = validateMaxSeats({ minSeats, maxSeats });
    if (validation.isErr()) {
      return validation;
    }
    // Whole-hour UTC alignment for Metronome effective dates.
    const flooredStartAt = floorToHourUTC(startAt);
    const flooredEndAt = endAt === null ? null : floorToHourUTC(endAt);
    if (flooredEndAt !== null && flooredEndAt <= flooredStartAt) {
      return new Err(new Error("endAt must be after startAt."));
    }
    // Nest under the caller's transaction when provided (SAVEPOINT) so the
    // supersede/end-date/insert steps are atomic; otherwise open a standalone
    // transaction.
    const txOptions = transaction ? { transaction } : {};
    return frontSequelize.transaction(txOptions, async (t) => {
      // Supersede any row that starts at or after the new window start.
      await this.model.destroy({
        where: {
          workspaceId: workspace.id,
          seatType,
          startAt: { [Op.gte]: flooredStartAt },
        },
        transaction: t,
      });
      // End-date the open-ended row that predates the new window so it stops at
      // `startAt` and becomes historical.
      const current = await this.model.findOne({
        where: { workspaceId: workspace.id, seatType, endAt: null },
        transaction: t,
      });
      if (current && current.startAt < flooredStartAt) {
        await current.update({ endAt: flooredStartAt }, { transaction: t });
      }
      await this.model.create(
        {
          workspaceId: workspace.id,
          seatType,
          minSeats,
          maxSeats: maxSeats ?? null,
          startAt: flooredStartAt,
          endAt: flooredEndAt,
        },
        { transaction: t }
      );
      return new Ok(undefined);
    });
  }

  /**
   * Replace the entire schedule of phases for a single (workspace, seat type)
   * in one shot. This is the primitive behind the poke "edit seat-limit
   * schedule" dialog, which submits the phases (each defined only by its start
   * date) for the selected seat type. An empty `phases` array clears the seat
   * type.
   *
   * Phases are treated as a contiguous timeline: end dates are DERIVED here —
   * each phase runs until the next phase's start, and the last (latest) phase
   * is always open-ended. This guarantees no gaps, no overlaps and no bounded
   * trailing phase by construction; callers cannot pass an inconsistent set of
   * windows. Each phase's `maxSeats` must be `>= minSeats`, `minSeats` a
   * non-negative integer, and no two phases may share the same start.
   */
  static async setScheduleForSeatType({
    workspace,
    seatType,
    phases,
    transaction,
  }: {
    workspace: LightWorkspaceType;
    seatType: MembershipSeatType;
    phases: Array<{
      minSeats: number;
      maxSeats: number | null;
      startAt: Date;
    }>;
    transaction?: Transaction;
  }): Promise<Result<void, Error>> {
    // Floor every start to the top of the UTC hour (Metronome parity), then
    // order by start.
    const sorted = phases
      .map((phase) => ({ ...phase, startAt: floorToHourUTC(phase.startAt) }))
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    for (let i = 0; i < sorted.length; i++) {
      const phase = sorted[i];
      const validation = validateMaxSeats({
        minSeats: phase.minSeats,
        maxSeats: phase.maxSeats,
      });
      if (validation.isErr()) {
        return validation;
      }
      if (!Number.isInteger(phase.minSeats) || phase.minSeats < 0) {
        return new Err(new Error("minSeats must be a non-negative integer."));
      }
      if (
        i > 0 &&
        sorted[i - 1].startAt.getTime() === phase.startAt.getTime()
      ) {
        return new Err(new Error("Phases must have distinct start dates."));
      }
    }
    const txOptions = transaction ? { transaction } : {};
    return frontSequelize.transaction(txOptions, async (t) => {
      await this.model.destroy({
        where: { workspaceId: workspace.id, seatType },
        transaction: t,
      });
      if (sorted.length > 0) {
        await this.model.bulkCreate(
          sorted.map((phase, i) => ({
            workspaceId: workspace.id,
            seatType,
            minSeats: phase.minSeats,
            maxSeats: phase.maxSeats,
            startAt: phase.startAt,
            // Derived: a phase runs until the next one starts; the last phase
            // is open-ended.
            endAt: i < sorted.length - 1 ? sorted[i + 1].startAt : null,
          })),
          { transaction: t }
        );
      }
      return new Ok(undefined);
    });
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
   * Remove all configured limits for a (workspace, seat type) — the current
   * one as well as any scheduled or historical rows. Returns whether at least
   * one row was actually deleted.
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
