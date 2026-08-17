import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { SoftDeletableWorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

/**
 * Records that a pod app (identified by its normalized app prefix) is shared to the workspace as
 * an agent toolset. `internalMCPServerId` is the sId of the dedicated `pod_app_toolset` internal
 * MCP server instance whose views expose the app's functions; the row is the binding between the
 * instance and the app. `toolsetName` mirrors the views' display name so listings never need a
 * per-share view fetch. Soft-deleted on unshare so a revoked share keeps history.
 */
export class PodAppShareModel extends SoftDeletableWorkspaceAwareModel<PodAppShareModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare spaceId: ForeignKey<SpaceModel["id"]>;
  declare appPrefix: string;
  declare internalMCPServerId: string;
  declare sharedByUserId: ForeignKey<UserModel["id"]> | null;
  declare toolsetName: string;
  declare description: string;

  declare space: NonAttribute<SpaceModel>;
}

PodAppShareModel.init(
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
    deletedAt: {
      type: DataTypes.DATE,
    },
    spaceId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    appPrefix: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    internalMCPServerId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    toolsetName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
  },
  {
    modelName: "pod_app_share",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "spaceId", "appPrefix"],
        where: { deletedAt: null },
        unique: true,
        concurrently: true,
        name: "pod_app_shares_workspace_space_app_prefix_active",
      },
      {
        fields: ["workspaceId", "internalMCPServerId"],
        where: { deletedAt: null },
        unique: true,
        concurrently: true,
        name: "pod_app_shares_workspace_internal_mcp_server_active",
      },
      { fields: ["spaceId"], concurrently: true },
    ],
  }
);

PodAppShareModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "RESTRICT",
  as: "space",
});
SpaceModel.hasMany(PodAppShareModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  as: "podAppShares",
});

PodAppShareModel.belongsTo(UserModel, {
  foreignKey: { name: "sharedByUserId", allowNull: true },
  onDelete: "SET NULL",
  as: "sharedByUser",
});
UserModel.hasMany(PodAppShareModel, {
  foreignKey: { name: "sharedByUserId", allowNull: true },
});
