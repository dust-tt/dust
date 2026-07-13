import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { WorkspaceSandboxEnvVarKind } from "@app/types/sandbox/env_var";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { Op } from "sequelize";

// One table for both sandbox env var scopes, discriminated by `spaceId`:
// NULL = workspace-scoped, set = pod-scoped (pods are project spaces).
// Uniqueness is per scope via the partial indexes below.
export class WorkspaceSandboxEnvVarModel extends WorkspaceAwareModel<WorkspaceSandboxEnvVarModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare spaceId: ForeignKey<SpaceModel["id"]> | null;
  declare name: string;
  declare kind: CreationOptional<WorkspaceSandboxEnvVarKind>;
  declare placeholderNonce: Buffer | null;
  declare allowedDomains: string[] | null;
  declare encryptedValue: string;
  declare createdByUserId: ForeignKey<UserModel["id"]> | null;
  declare lastUpdatedByUserId: ForeignKey<UserModel["id"]> | null;

  declare createdByUser: NonAttribute<UserModel | null>;
  declare lastUpdatedByUser: NonAttribute<UserModel | null>;
}

WorkspaceSandboxEnvVarModel.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    kind: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
      defaultValue: "config",
    },
    placeholderNonce: {
      type: DataTypes.BLOB,
      allowNull: true,
      field: "placeholder_nonce",
    },
    allowedDomains: {
      type: DataTypes.ARRAY(DANGEROUSLY_UNBOUNDED_TEXT),
      allowNull: true,
      field: "allowed_domains",
    },
    encryptedValue: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
  },
  {
    modelName: "workspace_sandbox_env_var",
    sequelize: frontSequelize,
    indexes: [
      // TODO(2026-07-12 SANDBOX_SECRETS): legacy full unique, superseded by
      // the partial uniques below. Kept so already-deployed
      // (workspaceId, name) queries stay indexed; the resources PR drops it
      // post-deploy.
      {
        name: "workspace_sandbox_env_vars_workspace_name_idx",
        unique: true,
        fields: ["workspaceId", "name"],
      },
      // Per-scope uniqueness: one name per workspace scope...
      {
        name: "sandbox_env_vars_workspace_scope_name_idx",
        unique: true,
        fields: ["workspaceId", "name"],
        where: { spaceId: null },
        concurrently: true,
      },
      // ...and one name per pod. Also serves FK lookups on spaceId (the
      // equality predicate implies the partial condition).
      {
        name: "sandbox_env_vars_pod_scope_name_idx",
        unique: true,
        fields: ["spaceId", "name"],
        where: { spaceId: { [Op.ne]: null } },
        concurrently: true,
      },
      // User FKs are SET NULL on user deletion — without these indexes,
      // scrubbing a user would scan the table (BACK13).
      { fields: ["createdByUserId"], concurrently: true },
      { fields: ["lastUpdatedByUserId"], concurrently: true },
    ],
  }
);

WorkspaceSandboxEnvVarModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: true },
  onDelete: "RESTRICT",
  as: "space",
});

SpaceModel.hasMany(WorkspaceSandboxEnvVarModel, {
  foreignKey: { name: "spaceId", allowNull: true },
});

WorkspaceSandboxEnvVarModel.belongsTo(UserModel, {
  as: "createdByUser",
  foreignKey: { name: "createdByUserId", allowNull: true },
  onDelete: "SET NULL",
});

WorkspaceSandboxEnvVarModel.belongsTo(UserModel, {
  as: "lastUpdatedByUser",
  foreignKey: { name: "lastUpdatedByUserId", allowNull: true },
  onDelete: "SET NULL",
});
