import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { MembershipSeatType } from "@app/types/memberships";
import type { CreationOptional } from "sequelize";

/**
 * Per-(workspace, seat-type) seat configuration.
 *
 * - `minSeats`: billing floor for that seat type — the minimum count billed to
 *   Metronome even when the actual headcount on the seat type is lower.
 * - `maxSeats`: hard assignment cap — null means no cap.
 *
 * Configurations are time-bounded like memberships so that changes can be
 * scheduled ahead of time:
 *
 * - `startAt`: when the configuration becomes effective.
 * - `endAt`: when it stops being effective; `null` means open-ended.
 *
 * A configuration is "active" at time `t` when `startAt <= t` and
 * (`endAt` is null or `endAt > t`). Scheduling a change end-dates the current
 * open-ended row at the effective date and inserts a new open-ended row that
 * starts on that date. The partial unique index below guarantees at most one
 * open-ended row per (workspace, seat type).
 */
export class WorkspaceSeatLimitModel extends WorkspaceAwareModel<WorkspaceSeatLimitModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare seatType: MembershipSeatType;
  declare minSeats: CreationOptional<number>;
  declare maxSeats: CreationOptional<number | null>;
  declare startAt: CreationOptional<Date>;
  declare endAt: CreationOptional<Date | null>;
}

WorkspaceSeatLimitModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    seatType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    minSeats: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    maxSeats: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    startAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    endAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    modelName: "workspace_seat_limit",
    sequelize: frontSequelize,
    indexes: [
      // At most one open-ended (current/future) configuration per
      // (workspace, seat type). Historical and scheduled rows carry a non-null
      // `endAt` and are therefore excluded from this constraint.
      {
        fields: ["workspaceId", "seatType"],
        unique: true,
        where: { endAt: null },
        name: "workspace_seat_limits_workspace_seat_type_active_idx",
      },
    ],
  }
);
