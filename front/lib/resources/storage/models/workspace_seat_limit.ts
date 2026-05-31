import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { MembershipSeatType } from "@app/types/memberships";
import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

/**
 * Per-(workspace, seat-type) min/max seat configuration.
 *
 * - `minSeats`: billing floor sent to Metronome even when the actual headcount
 *   on that seat type is lower (clamped up; for SEAT_BASED subscriptions the
 *   shortfall is added as unassigned seats).
 * - `maxSeats`: hard cap on how many members can be assigned that seat type.
 *   Once reached, new members fall through to the next tier or, if every tier
 *   is capped, to the `none` seat type. `null` means unlimited.
 */
export class WorkspaceSeatLimitModel extends WorkspaceAwareModel<WorkspaceSeatLimitModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare seatType: MembershipSeatType;
  declare minSeats: CreationOptional<number>;
  declare maxSeats: number | null;
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
  },
  {
    modelName: "workspace_seat_limit",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "seatType"],
        unique: true,
        name: "workspace_seat_limits_workspace_seat_type_idx",
      },
    ],
  }
);
