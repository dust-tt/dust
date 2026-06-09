import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { MembershipUpgradeRequestStatus } from "@app/types/memberships";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

// A member-initiated request to have their per-user spend limit raised by a
// workspace admin. A member can have at most one `pending` request at a time
// (enforced by a partial unique index); requesting again while one is pending
// is a no-op. Once an admin resolves it (approved/denied) the row is retained
// for history — the actual limit change is performed by the existing
// spend-limit / seat-type flows, this row only records the request outcome.
export class MembershipUpgradeRequestModel extends WorkspaceAwareModel<MembershipUpgradeRequestModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare status: CreationOptional<MembershipUpgradeRequestStatus>;
  declare resolvedAt: Date | null;

  // The member who requested the upgrade.
  declare userId: ForeignKey<UserModel["id"]>;
  // The admin who approved/denied the request (null while pending).
  declare resolvedByUserId: ForeignKey<UserModel["id"]> | null;

  declare user: NonAttribute<UserModel>;
  declare resolvedByUser: NonAttribute<UserModel>;
}

MembershipUpgradeRequestModel.init(
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
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "pending",
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "membership_upgrade_request",
    sequelize: frontSequelize,
    indexes: [
      // Admin listing of pending requests for a workspace.
      {
        fields: ["workspaceId", "status"],
        name: "membership_upgrade_requests_workspace_status_idx",
      },
      // At most one pending request per member.
      {
        fields: ["workspaceId", "userId"],
        unique: true,
        where: { status: "pending" },
        name: "membership_upgrade_requests_workspace_user_pending_idx",
      },
      { fields: ["userId"], name: "membership_upgrade_requests_user_idx" },
      {
        fields: ["resolvedByUserId"],
        name: "membership_upgrade_requests_resolved_by_user_idx",
      },
    ],
  }
);

UserModel.hasMany(MembershipUpgradeRequestModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
MembershipUpgradeRequestModel.belongsTo(UserModel, {
  as: "user",
  foreignKey: { name: "userId", allowNull: false },
});

MembershipUpgradeRequestModel.belongsTo(UserModel, {
  as: "resolvedByUser",
  foreignKey: { name: "resolvedByUserId", allowNull: true },
  onDelete: "SET NULL",
});
