import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes, Op } from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import {
  MEMBERSHIP_UPGRADE_REQUEST_PENDING_STATUS,
  type MembershipUpgradeRequestStatus,
} from "@app/types/memberships";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

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

  // Why the member needs the raised limit. Required for new requests
  // (enforced in application code, not at the DB level, so existing rows
  // are unaffected).
  declare reason: string | null;
  // How long the member expects to need it, in days. Informational only —
  // surfaced to the admin for context, not auto-enforced.
  declare requestedDurationDays: number | null;

  // Snapshot of the spend-limit override actually granted when this request
  // was approved via the linked "Edit limit" flow (see
  // `MembershipUpgradeRequestResource.recordGrant`). NULL when the request
  // was denied, or approved through a different flow (e.g. a seat upgrade)
  // that isn't tied to a pool-cap override.
  declare grantedAwuCredits: number | null;
  declare grantedExpiresAt: Date | null;
  // Stamped once the granted override stops being in effect — either the
  // expiration sweep reverted it, or a later spend-limit change superseded
  // it before its own expiry. NULL while the grant (if any) is still active.
  declare expiredAt: Date | null;

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
      defaultValue: MEMBERSHIP_UPGRADE_REQUEST_PENDING_STATUS,
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    reason: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      defaultValue: null,
    },
    requestedDurationDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    grantedAwuCredits: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    grantedExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    expiredAt: {
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
      // Admin history listing (resolved requests, most recent first).
      {
        fields: ["workspaceId", "resolvedAt"],
        name: "membership_upgrade_requests_workspace_resolved_at_idx",
        concurrently: true,
      },
      // Finds a user's still-active grant(s) to close out when superseded or
      // swept.
      {
        fields: ["userId", "expiredAt"],
        where: { grantedAwuCredits: { [Op.ne]: null } },
        name: "membership_upgrade_requests_user_active_grant_idx",
        concurrently: true,
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
