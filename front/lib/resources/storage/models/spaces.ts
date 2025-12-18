import type { CreationOptional, NonAttribute, Transaction } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import type { GroupModel } from "@app/lib/resources/storage/models/groups";
import { SoftDeletableWorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { SpaceKind } from "@app/types";
import { isUniqueSpaceKind } from "@app/types";

// Note, "Spaces" used to be called "Vaults" in the first release but where renamed to "Spaces" right after.
// This is why the model is called "SpaceModel" but the table is called "vaults" and foreign key are called "vaultId" in ResourceWithSpace.
// TODO We need to migrate the database as some point.
export class SpaceModel extends SoftDeletableWorkspaceAwareModel<SpaceModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare kind: SpaceKind;

  // This is a bit confusing as "group" means that we use provisioned groups to manage the space members instead of individual members in the UI.
  // But in both modes we have "groups" associated to the space to hold the members.
  declare managementMode: CreationOptional<"manual" | "group">;

  // This is a bit confusing (but temporary) as we have a "conversations" kind of space to hold ALL conversations files (legacy).
  // This flag is used to indicate if the space supports having conversations in it (for conversations groups).
  declare conversationsEnabled: CreationOptional<boolean>;

  declare groups: NonAttribute<GroupModel[]>;
}
SpaceModel.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    managementMode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "manual",
    },
    conversationsEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    modelName: "spaces",
    tableName: "vaults",
    sequelize: frontSequelize,
    indexes: [
      { unique: true, fields: ["workspaceId", "name", "deletedAt"] },
      { unique: false, fields: ["workspaceId", "kind"] },
    ],
  }
);

SpaceModel.addHook(
  "beforeCreate",
  "enforce_one_special_space_per_workspace",
  async (space: SpaceModel, options: { transaction: Transaction }) => {
    if (isUniqueSpaceKind(space.kind)) {
      const existingSpace = await SpaceModel.findOne({
        where: {
          workspaceId: space.workspaceId,
          kind: space.kind,
        },
        transaction: options.transaction,
      });

      if (existingSpace) {
        throw new Error(`A ${space.kind} space exists for this workspace.`, {
          cause: `enforce_one_${space.kind}_space_per_workspace`,
        });
      }
    }
  }
);
