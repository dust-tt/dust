import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { SoftDeletableWorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ModelIdType, ModelProviderIdType } from "@app/types";

export class TrackerConfigurationModel extends SoftDeletableWorkspaceAwareModel<TrackerConfigurationModel> {
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

  declare vaultId: ForeignKey<SpaceModel["id"]>;
  declare userId: ForeignKey<UserModel["id"]> | null; // If a user is deleted, the tracker should still be available

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
    indexes: [
      {
        fields: ["workspaceId", "status"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "vaultId"],
        concurrently: true,
      },
    ],
  }
);

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

// TODO: Add `workspaceId` in this column + backfill.
export class TrackerDataSourceConfigurationModel extends SoftDeletableWorkspaceAwareModel<TrackerDataSourceConfigurationModel> {
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
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-13): Remove index
      { fields: ["dataSourceId"] },
      { fields: ["dataSourceViewId"] },
      {
        fields: ["workspaceId", "dataSourceId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "trackerConfigurationId", "scope"],
        name: "tracker_data_source_config_workspace_id_tracker_config_id_scope",
      },
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

// TODO: Add workspaceId.
export class TrackerGenerationModel extends SoftDeletableWorkspaceAwareModel<TrackerGenerationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare content: string;
  declare thinking: string | null;

  declare trackerConfigurationId: ForeignKey<TrackerConfigurationModel["id"]>;
  declare dataSourceId: ForeignKey<DataSourceModel["id"]>;
  declare documentId: string;
  declare maintainedDocumentDataSourceId: ForeignKey<
    DataSourceModel["id"]
  > | null;
  declare maintainedDocumentId: string | null;

  declare consumedAt: Date | null;

  declare trackerConfiguration: NonAttribute<TrackerConfigurationModel>;
  declare dataSource: NonAttribute<DataSourceModel>;
  declare maintainedDocumentDataSource: NonAttribute<DataSourceModel> | null;
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
    indexes: [
      { fields: ["trackerConfigurationId"] },
      { fields: ["workspaceId"], concurrently: true },
    ],
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
  foreignKey: { allowNull: false, name: "dataSourceId" },
  as: "dataSource",
});

DataSourceModel.hasMany(TrackerGenerationModel, {
  foreignKey: { allowNull: true },
});
TrackerGenerationModel.belongsTo(DataSourceModel, {
  foreignKey: { allowNull: true, name: "maintainedDocumentDataSourceId" },
  as: "maintainedDocumentDataSource",
});
