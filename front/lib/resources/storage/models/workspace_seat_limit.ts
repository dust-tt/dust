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
 *
 * (`maxSeats` — a hard cap on assignments — will be added later.)
 */
export class WorkspaceSeatLimitModel extends WorkspaceAwareModel<WorkspaceSeatLimitModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare seatType: MembershipSeatType;
  declare minSeats: CreationOptional<number>;
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
