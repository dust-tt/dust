import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional } from "sequelize";

// The dfs tenant of a workspace (its tenant ID is the workspace sId). The tenant key and root ID are
// only returned by dfs `CreateTenant`: the key is stored in the oauth service, the root ID here.
export class DfsTenantModel extends WorkspaceAwareModel<DfsTenantModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // The oauth credential (provider `dfs`) holding the tenant key.
  declare credentialId: string;
  // The stored root directory, needed as the parent of top-level creates and renames.
  declare rootId: string;
}

DfsTenantModel.init(
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
    credentialId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    rootId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "dfs_tenants",
    indexes: [
      {
        fields: ["workspaceId"],
        name: "dfs_tenants_workspace_id_idx",
        unique: true,
        concurrently: true,
      },
    ],
  }
);
