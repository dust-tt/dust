import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionBaseStatus } from "@app/lib/actions/statuses";
import { TOOL_EXECUTION_BASE_STATUSES } from "@app/lib/actions/statuses";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import { SandboxFunctionInvocationModel } from "@app/lib/resources/storage/models/sandbox_function";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

// An MCP tool call made from inside a running sandbox function invocation. The invocation-keyed
// counterpart of AgentMCPActionModel, without its agent-loop coupling (no agent message, no step
// content, no citations) — hence status is the base tool-execution lifecycle, not the agent-loop
// extension. The tool is identified by (mcpServerViewId, toolName); the toolConfiguration snapshot
// is synthesized at creation from the view + internal-server manifest and drives execution. The
// tool output is a single GCS object (outputGcsPath), written once at completion — not per-block
// output-item rows.
export class SandboxFunctionMCPActionModel extends WorkspaceAwareModel<SandboxFunctionMCPActionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sandboxFunctionInvocationId: ForeignKey<
    SandboxFunctionInvocationModel["id"]
  >;
  declare mcpServerViewId: ForeignKey<MCPServerViewModel["id"]>;
  declare toolName: string;
  declare inputs: Record<string, unknown>;
  declare toolConfiguration: LightMCPToolConfigurationType;
  declare status: ToolExecutionBaseStatus;
  declare outputGcsPath: string | null;
  declare executionDurationMs: number | null;
  // Client-provided key deduplicating replayed `sandbox/actions/call` POSTs: a replay with the
  // same key (scoped to the invocation) returns the original action instead of creating a second
  // one. Null when the client did not send a key.
  declare idempotencyKey: string | null;

  declare sandboxFunctionInvocation: NonAttribute<SandboxFunctionInvocationModel>;
  declare mcpServerView: NonAttribute<MCPServerViewModel>;
}

SandboxFunctionMCPActionModel.init(
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
    sandboxFunctionInvocationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    mcpServerViewId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    toolName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    inputs: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    toolConfiguration: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(64),
      allowNull: false,
      validate: {
        isIn: [TOOL_EXECUTION_BASE_STATUSES],
      },
    },
    outputGcsPath: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: true,
      defaultValue: null,
    },
    executionDurationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    idempotencyKey: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "sandbox_function_mcp_action",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["sandboxFunctionInvocationId"],
        concurrently: true,
      },
      {
        fields: ["mcpServerViewId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "sandboxFunctionInvocationId"],
        name: "sandbox_function_mcp_actions_workspace_invocation",
        concurrently: true,
      },
    ],
  }
);

SandboxFunctionMCPActionModel.belongsTo(SandboxFunctionInvocationModel, {
  foreignKey: { name: "sandboxFunctionInvocationId", allowNull: false },
  onDelete: "RESTRICT",
  as: "sandboxFunctionInvocation",
});

SandboxFunctionInvocationModel.hasMany(SandboxFunctionMCPActionModel, {
  foreignKey: { name: "sandboxFunctionInvocationId", allowNull: false },
  as: "mcpActions",
});

SandboxFunctionMCPActionModel.belongsTo(MCPServerViewModel, {
  foreignKey: { name: "mcpServerViewId", allowNull: false },
  onDelete: "RESTRICT",
  as: "mcpServerView",
});

MCPServerViewModel.hasMany(SandboxFunctionMCPActionModel, {
  foreignKey: { name: "mcpServerViewId", allowNull: false },
  as: "sandboxFunctionMCPActions",
});
