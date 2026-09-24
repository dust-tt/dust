import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { SoftDeletableWorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { TagKind } from "@app/types/tag";
import type { CreationOptional } from "sequelize";

// Tags are soft-deletable: a deleted tag keeps its row (so historical `tag_agents` links stay
// FK-valid) but is excluded from every read by the base class. Recreating a tag with the same name
// restores (undeletes) this row (see `TagResource.makeNew`).
export class TagModel extends SoftDeletableWorkspaceAwareModel<TagModel> {
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
    deletedAt: {
      type: DataTypes.DATE,
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
