import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes, Op } from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { SpendLimitOverrideTimeframeType } from "@app/types/credits";
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
  // Rolling window `poolCapOverrideAwuCredits` is enforced over. NULL (the
  // default) preserves today's behavior: the cap applies over the implicit
  // monthly/pool-lifetime window. Meaningless when the override itself is
  // NULL.
  declare overrideLimitTimeframe: SpendLimitOverrideTimeframeType | null;
  // When set, the pool cap override (and its timeframe) is reverted to
  // unlimited once this timestamp passes — see the sweep workflow in
  // `@app/temporal/spend_limit_expiration`. NULL means the override never
  // expires (today's behavior). Meaningless when the override itself is
  // NULL.
  declare poolCapOverrideExpiresAt: Date | null;

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
    overrideLimitTimeframe: {
      type: DataTypes.STRING(8),
      allowNull: true,
      defaultValue: null,
    },
    poolCapOverrideExpiresAt: {
      type: DataTypes.DATE,
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
      // Lets the expiration sweep find expiring overrides without scanning
      // every membership row.
      {
        fields: ["poolCapOverrideExpiresAt"],
        where: { poolCapOverrideExpiresAt: { [Op.ne]: null } },
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
