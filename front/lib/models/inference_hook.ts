import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  InferenceHookEnforcementMode,
  InferenceHookFailMode,
  InferenceHookProviderId,
} from "@app/types/inference_hook";
import {
  INFERENCE_HOOK_ENFORCEMENT_MODE_DEFAULT,
  INFERENCE_HOOK_FAIL_MODE_DEFAULT,
  INFERENCE_HOOK_TIMEOUT_MS_DEFAULT,
} from "@app/types/inference_hook";
import type { CreationOptional } from "sequelize";

export class InferenceHookModel extends WorkspaceAwareModel<InferenceHookModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare providerId: InferenceHookProviderId;
  declare endpoint: string;
  declare encryptedCredentials: string;
  declare enforcementMode: CreationOptional<InferenceHookEnforcementMode>;
  declare failMode: CreationOptional<InferenceHookFailMode>;
  declare timeoutMs: CreationOptional<number>;
}

InferenceHookModel.init(
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
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    endpoint: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    encryptedCredentials: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    enforcementMode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: INFERENCE_HOOK_ENFORCEMENT_MODE_DEFAULT,
    },
    failMode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: INFERENCE_HOOK_FAIL_MODE_DEFAULT,
    },
    timeoutMs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: INFERENCE_HOOK_TIMEOUT_MS_DEFAULT,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "inference_hook",
    tableName: "inference_hooks",
    indexes: [
      {
        unique: true,
        fields: ["workspaceId"],
      },
    ],
  }
);
