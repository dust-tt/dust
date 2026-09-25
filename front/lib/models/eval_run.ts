import type { EvalConfig, RunStatus, StepOutput, StepStatus } from "@app/lib/evals/types";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional } from "sequelize";

export class EvalRunModel extends WorkspaceAwareModel<EvalRunModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare sId: string;
  declare config: EvalConfig;
  declare configHash: string;
  declare status: RunStatus;
  declare cancelRequested: boolean;
  declare requestedBy: string | null;
}

EvalRunModel.init({
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  sId: { type: DataTypes.STRING, allowNull: false },
  config: { type: DataTypes.JSONB, allowNull: false },
  configHash: { type: DataTypes.STRING(64), allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false },
  cancelRequested: { type: DataTypes.BOOLEAN, allowNull: false },
  requestedBy: { type: DataTypes.STRING, allowNull: true },
}, {
  modelName: "eval_run", sequelize: frontSequelize,
  indexes: [
    { fields: ["workspaceId", "sId"], unique: true },
    { fields: ["workspaceId", "createdAt"] },
  ],
});

export class EvalStepModel extends WorkspaceAwareModel<EvalStepModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare runId: string;
  declare caseIndex: number;
  declare voteIndex: number;
  declare status: StepStatus;
  declare conversationId: string | null;
  declare userMessageId: string | null;
  declare output: StepOutput | null;
  declare error: string | null;
}

EvalStepModel.init({
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  runId: { type: DataTypes.STRING, allowNull: false },
  caseIndex: { type: DataTypes.INTEGER, allowNull: false },
  voteIndex: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false },
  conversationId: { type: DataTypes.STRING, allowNull: true },
  userMessageId: { type: DataTypes.STRING, allowNull: true },
  output: { type: DataTypes.JSONB, allowNull: true },
  error: { type: DataTypes.STRING(1024), allowNull: true },
}, {
  modelName: "eval_step", sequelize: frontSequelize,
  indexes: [{ fields: ["workspaceId", "runId", "caseIndex", "voteIndex"], unique: true }],
});
