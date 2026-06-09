import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes, Op } from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  MembershipOriginType,
  MembershipRoleType,
  MembershipSeatType,
  UserCreditState,
} from "@app/types/memberships";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

export class MembershipModel extends WorkspaceAwareModel<MembershipModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare role: MembershipRoleType;
  declare origin: MembershipOriginType;
  declare startAt: Date;
  declare endAt: Date | null;
  declare firstUsedAt: Date | null;
  declare seatType: CreationOptional<MembershipSeatType>;
  declare creditState: CreationOptional<UserCreditState>;
  // Admin-set per-user cap on workspace-pool AWU consumption, in AWU credits,
  // excluding the seat allowance (i.e. exactly what the admin entered). NULL
  // means no override — the seat-type default applies. The Metronome
  // `spend_threshold_reached` alert (threshold = override + seat allowance)
  // is derived from this value and remains the enforcement mechanism.
  declare poolCapOverrideAwuCredits: number | null;

  declare userId: ForeignKey<UserModel["id"]>;
  declare user: NonAttribute<UserModel>;
}
MembershipModel.init(
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
    role: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    origin: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "invited",
    },
    startAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    firstUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    seatType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "workspace",
    },
    creditState: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "on_pool",
    },
    poolCapOverrideAwuCredits: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "membership",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["userId", "role"] },
      { fields: ["startAt"] },
      { fields: ["endAt"] },
      { fields: ["workspaceId", "userId", "startAt", "endAt"] },
      // Prevent duplicate active memberships for same user/workspace.
      {
        fields: ["userId", "workspaceId"],
        unique: true,
        where: { endAt: null },
      },
      // Index for counting first-used seats (seat billing)
      {
        fields: ["workspaceId", "firstUsedAt"],
        where: { firstUsedAt: { [Op.ne]: null } },
        concurrently: true,
      },
    ],
  }
);
UserModel.hasMany(MembershipModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

MembershipModel.belongsTo(UserModel);
