import type { DatasetSchema } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";

export class App extends Model<
  InferAttributes<App>,
  InferCreationAttributes<App>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare name: string;
  declare description: string | null;
  declare visibility: "public" | "private" | "deleted";
  declare savedSpecification: string | null;
  declare savedConfig: string | null;
  declare savedRun: string | null;
  declare dustAPIProjectId: string;

  declare workspaceId: ForeignKey<Workspace["id"]>;
}
App.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
Workspace.hasMany(App, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});

export class Provider extends Model<
  InferAttributes<Provider>,
  InferCreationAttributes<Provider>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare providerId: string;
  declare config: string;

  declare workspaceId: ForeignKey<Workspace["id"]>;
}
Provider.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
  onDelete: "CASCADE",
});

export class Dataset extends Model<
  InferAttributes<Dataset>,
  InferCreationAttributes<Dataset>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare description: string | null;
  declare schema: DatasetSchema | null;

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare appId: ForeignKey<App["id"]>;
}
Dataset.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
App.hasMany(Dataset, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
Workspace.hasMany(Dataset, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});

export class Clone extends Model<
  InferAttributes<Clone>,
  InferCreationAttributes<Clone>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare fromId: ForeignKey<App["id"]>;
  declare toId: ForeignKey<App["id"]>;
}
Clone.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
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
    fromId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "apps",
        key: "id",
      },
    },
    toId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "apps",
        key: "id",
      },
    },
  },
  {
    modelName: "clone",
    sequelize: frontSequelize,
  }
);
Clone.belongsTo(App, {
  foreignKey: { name: "fromId", allowNull: false },
  onDelete: "CASCADE",
});
Clone.belongsTo(App, {
  foreignKey: { name: "toId", allowNull: false },
  onDelete: "CASCADE",
});
