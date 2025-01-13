import type { ModelIdType, ModelProviderIdType } from "@dust-tt/types";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { SoftDeletableModel } from "@app/lib/resources/storage/wrappers";

export class TrackerConfigurationModel extends SoftDeletableModel<TrackerConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare status: "active" | "inactive";
  declare name: string;
  declare description: string | null;

  declare modelId: ModelIdType;
  declare providerId: ModelProviderIdType;
  declare temperature: number;

  declare prompt: string | null;

  declare frequency: string | null;
  declare lastNotifiedAt: Date | null;
  declare skipEmptyEmails: boolean;

  declare recipients: string[] | null;

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare vaultId: ForeignKey<SpaceModel["id"]>;
  declare userId: ForeignKey<UserModel["id"]> | null; // If a user is deleted, the tracker should still be available

  declare workspace: NonAttribute<Workspace>;
  declare space: NonAttribute<SpaceModel>;
  declare user: NonAttribute<UserModel> | null;
  declare dataSourceConfigurations: NonAttribute<
    TrackerDataSourceConfigurationModel[]
  >;
  declare generations: NonAttribute<TrackerGenerationModel[]>;
}

TrackerConfigurationModel.init(
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
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "active",
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    modelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    temperature: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.7,
    },
    prompt: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    frequency: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    skipEmptyEmails: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lastNotifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    recipients: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
  },
  {
    modelName: "tracker_configuration",
    sequelize: frontSequelize,
    indexes: [{ fields: ["workspaceId"] }],
  }
);

Workspace.hasMany(TrackerConfigurationModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

TrackerConfigurationModel.belongsTo(Workspace, {
  foreignKey: { allowNull: false },
});

SpaceModel.hasMany(TrackerConfigurationModel, {
  foreignKey: { allowNull: false, name: "vaultId" },
  onDelete: "RESTRICT",
});

TrackerConfigurationModel.belongsTo(SpaceModel, {
  foreignKey: { allowNull: false, name: "vaultId" },
});

UserModel.hasMany(TrackerConfigurationModel, {
  foreignKey: { allowNull: true },
  onDelete: "RESTRICT",
});

TrackerConfigurationModel.belongsTo(UserModel, {
  foreignKey: { allowNull: true },
});

export class TrackerDataSourceConfigurationModel extends SoftDeletableModel<TrackerDataSourceConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare scope: "maintained" | "watched";
  declare parentsIn: string[] | null;
  declare parentsNotIn: string[] | null;

  declare trackerConfigurationId: ForeignKey<TrackerConfigurationModel["id"]>;

  declare dataSourceId: ForeignKey<DataSourceModel["id"]>;
  declare dataSourceViewId: ForeignKey<DataSourceViewModel["id"]>;

  declare trackerConfiguration: NonAttribute<TrackerConfigurationModel>;
  declare dataSource: NonAttribute<DataSourceModel>;
  declare dataSourceView: NonAttribute<DataSourceViewModel>;
}

TrackerDataSourceConfigurationModel.init(
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
    scope: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    parentsIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    parentsNotIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
  },
  {
    modelName: "tracker_data_source_configuration",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["trackerConfigurationId"] },
      {
        fields: ["parentsIn"],
        using: "gin",
        name: "tracker_data_source_configuration_parent_ids_gin_idx",
      },
      { fields: ["dataSourceId"] },
      { fields: ["dataSourceViewId"] },
    ],
  }
);

TrackerConfigurationModel.hasMany(TrackerDataSourceConfigurationModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
  as: "dataSourceConfigurations",
});
TrackerDataSourceConfigurationModel.belongsTo(TrackerConfigurationModel, {
  foreignKey: { allowNull: false },
});

DataSourceModel.hasMany(TrackerDataSourceConfigurationModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
TrackerDataSourceConfigurationModel.belongsTo(DataSourceModel, {
  foreignKey: { allowNull: false },
});

DataSourceViewModel.hasMany(TrackerDataSourceConfigurationModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
TrackerDataSourceConfigurationModel.belongsTo(DataSourceViewModel, {
  foreignKey: { allowNull: false },
});

export class TrackerGenerationModel extends SoftDeletableModel<TrackerGenerationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare content: string;
  declare thinking: string | null;

  declare trackerConfigurationId: ForeignKey<TrackerConfigurationModel["id"]>;
  declare dataSourceId: ForeignKey<DataSourceModel["id"]>;
  declare documentId: string;
  declare maintainedDocumentDataSourceId: ForeignKey<DataSourceModel["id"]>;
  declare maintainedDocumentId: string;

  declare consumedAt: Date | null;

  declare trackerConfiguration: NonAttribute<TrackerConfigurationModel>;
  declare dataSource: NonAttribute<DataSourceModel>;
  declare maintainedDocumentDataSource: NonAttribute<DataSourceModel>;
}

TrackerGenerationModel.init(
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
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    thinking: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    documentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    consumedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    maintainedDocumentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "tracker_generation",
    sequelize: frontSequelize,
    indexes: [{ fields: ["trackerConfigurationId"] }],
  }
);

TrackerConfigurationModel.hasMany(TrackerGenerationModel, {
  foreignKey: { allowNull: false },
  as: "generations",
  onDelete: "RESTRICT",
});
TrackerGenerationModel.belongsTo(TrackerConfigurationModel, {
  foreignKey: { allowNull: false },
});

DataSourceModel.hasMany(TrackerGenerationModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
TrackerGenerationModel.belongsTo(DataSourceModel, {
  foreignKey: { allowNull: false },
  as: "dataSource",
});

DataSourceModel.hasMany(TrackerGenerationModel, {
  foreignKey: { allowNull: true },
  as: "maintainedDocumentDataSource",
});
TrackerGenerationModel.belongsTo(DataSourceModel, {
  foreignKey: { allowNull: false },
  as: "maintainedDocumentDataSource",
});
