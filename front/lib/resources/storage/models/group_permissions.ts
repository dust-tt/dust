import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  GrantType,
  GroupPermissionResourceType,
} from "@app/types/group_permissions";
import type { CreationOptional, ForeignKey } from "sequelize";

// Single table backing all Admin Governance permission grants (design doc §1A). See
// `@app/types/group_permissions` for the vocabulary and `group_permission_registry` for validity.
export class GroupPermissionModel extends WorkspaceAwareModel<GroupPermissionModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare groupId: ForeignKey<GroupModel["id"]>;
  declare grantType: GrantType;
  declare resourceType: GroupPermissionResourceType;
  // Resource ModelId, or -1 (WHOLE_TYPE_RESOURCE_ID) for "the type as a whole".
  declare resourceId: number;
  // workspaceId is inherited from WorkspaceAwareModel.
}

GroupPermissionModel.init(
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
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
    groupId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    grantType: {
      type: DataTypes.STRING(256),
      allowNull: false,
    },
    resourceType: {
      type: DataTypes.STRING(256),
      allowNull: false,
    },
    resourceId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    // workspaceId is automatically added by WorkspaceAwareModel.init.
  },
  {
    modelName: "group_permissions",
    sequelize: frontSequelize,
    indexes: [
      // Dedupes grants and covers the "does this group have this grant" direction. A group belongs
      // to a single workspace, so groupId already scopes the workspace — no need for workspaceId
      // here. Its leading groupId also serves as the FK index (BACK13) for group deletion.
      {
        name: "group_permissions_group_gtype_rtype_rid_unique",
        unique: true,
        fields: ["groupId", "grantType", "resourceType", "resourceId"],
      },
      // "who can act on resource X" direction.
      {
        name: "group_permissions_ws_rtype_rid",
        fields: ["workspaceId", "resourceType", "resourceId"],
      },
      // Auth direction: resolvePermissions loads all grants for the caller's groups
      // (workspaceId + groupId = ANY). Without this index the planner falls back to a BitmapAnd
      // that scans every grant row of the workspace on each call.
      {
        name: "group_permissions_ws_group",
        fields: ["workspaceId", "groupId"],
        concurrently: true,
      },
    ],
  }
);

GroupPermissionModel.belongsTo(GroupModel, {
  foreignKey: { name: "groupId", allowNull: false },
  targetKey: "id",
});
GroupModel.hasMany(GroupPermissionModel, {
  foreignKey: { name: "groupId", allowNull: false },
  sourceKey: "id",
});
