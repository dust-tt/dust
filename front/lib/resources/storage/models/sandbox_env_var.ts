import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { SandboxEnvVarKind } from "@app/types/sandbox/env_var";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { Op } from "sequelize";

// One table for both sandbox env var scopes, discriminated by `spaceId`:
// NULL = workspace-scoped, set = pod-scoped (pods are project spaces).
// Uniqueness is per scope via the partial indexes below.
export class SandboxEnvVarModel extends WorkspaceAwareModel<SandboxEnvVarModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare spaceId: ForeignKey<SpaceModel["id"]> | null;
  declare name: string;
  declare kind: CreationOptional<SandboxEnvVarKind>;
  declare placeholderNonce: Buffer | null;
  declare allowedDomains: string[] | null;
  declare encryptedValue: string;
  declare createdByUserId: ForeignKey<UserModel["id"]> | null;
  declare lastUpdatedByUserId: ForeignKey<UserModel["id"]> | null;

  declare createdByUser: NonAttribute<UserModel | null>;
  declare lastUpdatedByUser: NonAttribute<UserModel | null>;
}

SandboxEnvVarModel.init(
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
    // The table keeps its legacy workspace_-prefixed name; renaming it is a
    // dedicated follow-up migration.
    modelName: "workspace_sandbox_env_var",
    sequelize: frontSequelize,
    indexes: [
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
      // Workspace scrub deletes by bare workspaceId, which neither partial
      // above can serve (the predicate implies neither spaceId condition).
      // Keeps the workspace FK indexed once the legacy full unique on
      // (workspaceId, name) is dropped post-deploy (BACK13).
      {
        name: "sandbox_env_vars_workspace_id_idx",
        fields: ["workspaceId"],
        concurrently: true,
      },
      // User FKs are SET NULL on user deletion — without these indexes,
      // scrubbing a user would scan the table (BACK13).
      { fields: ["createdByUserId"], concurrently: true },
      { fields: ["lastUpdatedByUserId"], concurrently: true },
    ],
  }
);

SandboxEnvVarModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: true },
  onDelete: "RESTRICT",
  as: "space",
});

SpaceModel.hasMany(SandboxEnvVarModel, {
  foreignKey: { name: "spaceId", allowNull: true },
});

SandboxEnvVarModel.belongsTo(UserModel, {
  as: "createdByUser",
  foreignKey: { name: "createdByUserId", allowNull: true },
  onDelete: "SET NULL",
});

SandboxEnvVarModel.belongsTo(UserModel, {
  as: "lastUpdatedByUser",
  foreignKey: { name: "lastUpdatedByUserId", allowNull: true },
  onDelete: "SET NULL",
});
