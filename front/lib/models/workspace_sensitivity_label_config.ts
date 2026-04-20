import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

export type SensitivityLabelSourceType = "connector" | "mcp_connection";

// Allowed label shapes:
// - Microsoft: string (sensitivityLabelId GUID)
export type MicrosoftAllowedLabel = string;

export type AllowedLabel = MicrosoftAllowedLabel; // We'll add Google in the future

export class WorkspaceSensitivityLabelConfigModel extends WorkspaceAwareModel<WorkspaceSensitivityLabelConfigModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // "connector" → sourceId is the data source sId
  // "mcp_connection" → sourceId is the internalMCPServerId
  declare sourceType: SensitivityLabelSourceType;
  declare sourceId: string;
  declare allowedLabels: AllowedLabel[];
}

WorkspaceSensitivityLabelConfigModel.init(
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
    sourceType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sourceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    allowedLabels: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "workspace_sensitivity_label_config",
    indexes: [
      {
        fields: ["workspaceId", "sourceType", "sourceId"],
        name: "workspace_sensitivity_label_configs_workspace_source_idx",
        concurrently: true,
      },
    ],
  }
);
