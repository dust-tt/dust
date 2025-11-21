import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class InternalMCPServerCredentialModel extends WorkspaceAwareModel<InternalMCPServerCredentialModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare internalMCPServerId: string;
  declare sharedSecret: string | null;
  declare customHeaders: Record<string, string> | null;
}

InternalMCPServerCredentialModel.init(
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
    internalMCPServerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sharedSecret: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    customHeaders: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "internal_mcp_server_credential",
    indexes: [
      {
        name: "mcp_credential_serverid_uniq",
        fields: ["workspaceId", "internalMCPServerId"],
        unique: true,
      },
    ],
  }
);
