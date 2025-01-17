import type { AppVisibility, DatasetSchema } from "@dust-tt/types";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import {
  BaseModel,
  SoftDeletableModel,
} from "@app/lib/resources/storage/wrappers";

// TODO(2024-10-04 flav) Remove visibility from here.
export class AppModel extends SoftDeletableModel<AppModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare name: string;
  declare description: string | null;
  declare visibility: AppVisibility;
  declare savedSpecification: string | null;
  declare savedConfig: string | null;
  declare savedRun: string | null;
  declare dustAPIProjectId: string;

  declare vaultId: ForeignKey<SpaceModel["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;

  declare space: NonAttribute<SpaceModel>;
  declare workspace: NonAttribute<Workspace>;
}
AppModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    deletedAt: {
      type: DataTypes.DATE,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    savedSpecification: {
      type: DataTypes.TEXT,
    },
    savedConfig: {
      type: DataTypes.TEXT,
    },
    savedRun: {
      type: DataTypes.TEXT,
    },
    dustAPIProjectId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "app",
    sequelize: frontSequelize,
    indexes: [
      { unique: true, fields: ["sId"] },
      { fields: ["workspaceId", "visibility"] },
      { fields: ["workspaceId", "sId", "visibility"] },
    ],
  }
);

Workspace.hasMany(AppModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
AppModel.belongsTo(Workspace);

SpaceModel.hasMany(AppModel, {
  foreignKey: { allowNull: false, name: "vaultId" },
  onDelete: "RESTRICT",
});
AppModel.belongsTo(SpaceModel, {
  foreignKey: { allowNull: false, name: "vaultId" },
});

export class Provider extends BaseModel<Provider> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare providerId: string;
  declare config: string;

  declare workspaceId: ForeignKey<Workspace["id"]>;
}
Provider.init(
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
    config: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    modelName: "provider",
    sequelize: frontSequelize,
    indexes: [{ fields: ["workspaceId"] }],
  }
);
Workspace.hasMany(Provider, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

export class Dataset extends BaseModel<Dataset> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare description: string | null;
  declare schema: DatasetSchema | null;

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare appId: ForeignKey<AppModel["id"]>;
}
Dataset.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
    },
    schema: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    modelName: "dataset",
    sequelize: frontSequelize,
    indexes: [{ fields: ["workspaceId", "appId", "name"] }],
  }
);

AppModel.hasMany(Dataset, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
Dataset.belongsTo(AppModel);

Workspace.hasMany(Dataset, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

export class Clone extends BaseModel<Clone> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare fromId: ForeignKey<AppModel["id"]>;
  declare toId: ForeignKey<AppModel["id"]>;
}
Clone.init(
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
  },
  {
    modelName: "clone",
    sequelize: frontSequelize,
  }
);
Clone.belongsTo(AppModel, {
  foreignKey: { name: "fromId", allowNull: false },
  onDelete: "RESTRICT",
});
Clone.belongsTo(AppModel, {
  foreignKey: { name: "toId", allowNull: false },
  onDelete: "RESTRICT",
});
