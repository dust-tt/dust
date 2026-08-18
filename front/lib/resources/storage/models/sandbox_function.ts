import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import { validateJsonSchema } from "@app/lib/utils/json_schemas";
import type {
  SandboxFunctionExecutionMode,
  SandboxFunctionInvocationOrigin,
  SandboxFunctionInvocationStatus,
  SandboxFunctionStake,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import {
  DEFAULT_SANDBOX_FUNCTION_EXECUTION_MODE,
  DEFAULT_SANDBOX_FUNCTION_STAKE,
  isValidSandboxFunctionSlug,
  SANDBOX_FUNCTION_EXECUTION_MODES,
  SANDBOX_FUNCTION_INVOCATION_ORIGINS,
  SANDBOX_FUNCTION_INVOCATION_STATUSES,
  SANDBOX_FUNCTION_STAKES,
  SANDBOX_FUNCTION_USER_IDENTITY_POLICIES,
} from "@app/types/api/sandbox_functions";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

function validateSandboxFunctionJsonSchema(value: unknown): void {
  if (typeof value !== "object" && typeof value !== "string") {
    throw new Error("JSON schema is not an object or a string");
  }

  const validationResult = validateJsonSchema(value);
  if (!validationResult.isValid) {
    throw new Error(`Invalid JSON schema: ${validationResult.error}`);
  }
}

function validateSandboxFunctionSlug(value: unknown): void {
  if (!isValidSandboxFunctionSlug(value)) {
    throw new Error(
      "Slug must be lowercase alphanumeric with single hyphen separators."
    );
  }
}

export class SandboxFunctionModel extends WorkspaceAwareModel<SandboxFunctionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare spaceId: ForeignKey<SpaceModel["id"]>;
  declare fileId: ForeignKey<FileModel["id"]>;
  declare slug: string;
  declare description: string;
  declare userIdentity: SandboxFunctionUserIdentityPolicy | null;
  declare executionMode: CreationOptional<SandboxFunctionExecutionMode>;
  // The approval level a tool derived from this function starts at. A default, not a verdict: it is
  // what the publisher declared, and an override can sit on top of it.
  declare defaultStake: CreationOptional<SandboxFunctionStake>;
  // Sha256 hex of the published bundle. Stamped onto every invocation envelope so the in-sandbox
  // warm server can refuse to serve a bundle the publisher has since replaced. Null only for
  // functions last published before the column existed.
  declare bundleSha256: string | null;
  declare inputSchema: JSONSchema;
  declare outputSchema: JSONSchema;

  declare space: NonAttribute<SpaceModel>;
  declare file: NonAttribute<FileModel>;
}

export class SandboxFunctionInvocationModel extends WorkspaceAwareModel<SandboxFunctionInvocationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sandboxFunctionId: ForeignKey<SandboxFunctionModel["id"]>;
  // Human who triggered the invocation. Null for non-human origins (API key, scheduled/bot runs).
  declare userId: ForeignKey<UserModel["id"]> | null;
  declare origin: SandboxFunctionInvocationOrigin | null;
  declare status: SandboxFunctionInvocationStatus;
  declare gcsPath: string;

  declare sandboxFunction: NonAttribute<SandboxFunctionModel>;
  declare user: NonAttribute<UserModel> | null;
}

SandboxFunctionModel.init(
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
    spaceId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    fileId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        isValidSlug: validateSandboxFunctionSlug,
      },
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    userIdentity: {
      type: DataTypes.STRING(64),
      allowNull: true,
      validate: {
        isIn: [SANDBOX_FUNCTION_USER_IDENTITY_POLICIES],
      },
    },
    executionMode: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: DEFAULT_SANDBOX_FUNCTION_EXECUTION_MODE,
      validate: {
        isIn: [SANDBOX_FUNCTION_EXECUTION_MODES],
      },
    },
    defaultStake: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: DEFAULT_SANDBOX_FUNCTION_STAKE,
      validate: {
        isIn: [SANDBOX_FUNCTION_STAKES],
      },
    },
    bundleSha256: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    inputSchema: {
      type: DataTypes.JSONB,
      allowNull: false,
      validate: {
        isValidJSONSchema: validateSandboxFunctionJsonSchema,
      },
    },
    outputSchema: {
      type: DataTypes.JSONB,
      allowNull: false,
      validate: {
        isValidJSONSchema: validateSandboxFunctionJsonSchema,
      },
    },
  },
  {
    modelName: "sandbox_function",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "spaceId", "fileId"],
        unique: true,
        concurrently: true,
      },
      {
        fields: ["workspaceId", "spaceId", "slug"],
        unique: true,
        concurrently: true,
      },
      {
        fields: ["spaceId"],
        concurrently: true,
      },
      {
        fields: ["fileId"],
        unique: true,
        concurrently: true,
      },
    ],
  }
);

SandboxFunctionModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "RESTRICT",
  as: "space",
});

SpaceModel.hasMany(SandboxFunctionModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  as: "sandboxFunctions",
});

SandboxFunctionModel.belongsTo(FileModel, {
  foreignKey: { name: "fileId", allowNull: false },
  onDelete: "RESTRICT",
  as: "file",
});

FileModel.hasMany(SandboxFunctionModel, {
  foreignKey: { name: "fileId", allowNull: false },
  as: "sandboxFunctions",
});

SandboxFunctionInvocationModel.init(
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
    sandboxFunctionId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    userId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    origin: {
      type: DataTypes.STRING(64),
      allowNull: true,
      validate: {
        isIn: [SANDBOX_FUNCTION_INVOCATION_ORIGINS],
      },
    },
    status: {
      type: DataTypes.STRING(64),
      allowNull: false,
      validate: {
        isIn: [SANDBOX_FUNCTION_INVOCATION_STATUSES],
      },
    },
    gcsPath: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
  },
  {
    modelName: "sandbox_function_invocation",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["sandboxFunctionId"],
        concurrently: true,
      },
      {
        fields: ["userId"],
        concurrently: true,
      },
    ],
  }
);

SandboxFunctionInvocationModel.belongsTo(SandboxFunctionModel, {
  foreignKey: { name: "sandboxFunctionId", allowNull: false },
  onDelete: "RESTRICT",
  as: "sandboxFunction",
});

SandboxFunctionModel.hasMany(SandboxFunctionInvocationModel, {
  foreignKey: { name: "sandboxFunctionId", allowNull: false },
  as: "invocations",
});

SandboxFunctionInvocationModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: true },
  onDelete: "SET NULL",
  as: "user",
});

UserModel.hasMany(SandboxFunctionInvocationModel, {
  foreignKey: { name: "userId", allowNull: true },
});
