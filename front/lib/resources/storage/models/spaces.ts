import type { SpaceKind } from "@dust-tt/types";
import { isUniqueSpaceKind } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  NonAttribute,
  Transaction,
} from "sequelize";
import { DataTypes } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import type { GroupModel } from "@app/lib/resources/storage/models/groups";
import { SoftDeletableModel } from "@app/lib/resources/storage/wrappers/base";

export class SpaceModel extends SoftDeletableModel<SpaceModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare kind: SpaceKind;

  declare workspaceId: ForeignKey<Workspace["id"]>;
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

Workspace.hasMany(SpaceModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
SpaceModel.belongsTo(Workspace, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

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
