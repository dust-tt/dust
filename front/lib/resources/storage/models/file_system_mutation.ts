import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional } from "sequelize";

export type FileSystemMutationKind = "create" | "remove" | "rename";

/** A completed namespace change, kept briefly so HTTP retries are safe. */
export class FileSystemMutationModel extends WorkspaceAwareModel<FileSystemMutationModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare completedAt: Date;

  declare requestId: string;
  declare kind: FileSystemMutationKind;
  declare response: unknown;
}

FileSystemMutationModel.init(
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
    completedAt: { type: DataTypes.DATE, allowNull: false },
    requestId: { type: DataTypes.STRING, allowNull: false },
    kind: { type: DataTypes.STRING, allowNull: false },
    response: { type: DataTypes.JSONB, allowNull: false },
  },
  {
    modelName: "file_system_mutation",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "file_system_mutations_request_idx",
        unique: true,
        fields: ["workspaceId", "requestId"],
      },
      {
        name: "file_system_mutations_completed_idx",
        fields: ["workspaceId", "completedAt"],
      },
    ],
  }
);
