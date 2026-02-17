import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { TagKind } from "@app/types/tag";
import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

export class TagModel extends WorkspaceAwareModel<TagModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare kind: TagKind;

  declare name: string;
}
TagModel.init(
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
    kind: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "standard",
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "tags",
    sequelize: frontSequelize,
    indexes: [{ unique: true, fields: ["workspaceId", "name"] }],
  }
);
