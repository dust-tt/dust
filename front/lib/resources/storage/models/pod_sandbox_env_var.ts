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

// Pod-scoped mirror of WorkspaceSandboxEnvVarModel (pods are project spaces,
// so the FK targets the `vaults` table via SpaceModel). Values are encrypted
// with the pod space sId as scope key, not the workspace sId.
export class PodSandboxEnvVarModel extends WorkspaceAwareModel<PodSandboxEnvVarModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare spaceId: ForeignKey<SpaceModel["id"]>;
  declare name: string;
  declare kind: CreationOptional<WorkspaceSandboxEnvVarKind>;
  declare placeholderNonce: Buffer | null;
  declare allowedDomains: string[] | null;
  // Null only for external secret sources (none implemented yet):
  // `dust-managed` rows always carry the AES-256-CBC ciphertext.
  declare encryptedValue: string | null;
  // A SecretSourceKind (see lib/api/sandbox/secret_source.ts). Typed as
  // string because the DB may hold kinds newer than the deployed code.
  declare secretSourceKind: CreationOptional<string>;
  // Encrypted provider config for external secret sources. Always null for
  // `dust-managed`; parsing/decryption is deferred to the provider PRs.
  declare secretSourceConfig: object | null;
  declare createdByUserId: ForeignKey<UserModel["id"]> | null;
  declare lastUpdatedByUserId: ForeignKey<UserModel["id"]> | null;

  declare createdByUser: NonAttribute<UserModel | null>;
  declare lastUpdatedByUser: NonAttribute<UserModel | null>;
}

PodSandboxEnvVarModel.init(
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
      allowNull: true,
    },
    secretSourceKind: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
      defaultValue: "dust-managed",
      field: "secret_source_kind",
    },
    secretSourceConfig: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: "secret_source_config",
    },
  },
  {
    modelName: "pod_sandbox_env_var",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "pod_sandbox_env_vars_space_name_idx",
        unique: true,
        fields: ["spaceId", "name"],
        concurrently: true,
      },
      { fields: ["workspaceId"], concurrently: true },
    ],
  }
);

PodSandboxEnvVarModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "RESTRICT",
});

PodSandboxEnvVarModel.belongsTo(UserModel, {
  as: "createdByUser",
  foreignKey: { name: "createdByUserId", allowNull: true },
  onDelete: "SET NULL",
});

PodSandboxEnvVarModel.belongsTo(UserModel, {
  as: "lastUpdatedByUser",
  foreignKey: { name: "lastUpdatedByUserId", allowNull: true },
  onDelete: "SET NULL",
});
