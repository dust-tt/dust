import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import type { IntercomSyncAllConversationsStatus } from "@connectors/connectors/intercom/lib/types";
import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";

export const DEFAULT_CONVERSATIONS_SLIDING_WINDOW = 180;

export class IntercomWorkspaceModel extends ConnectorBaseModel<IntercomWorkspaceModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare intercomWorkspaceId: string;
  declare name: string;
  declare region: string;

  declare conversationsSlidingWindow: number;
  declare syncAllConversations: IntercomSyncAllConversationsStatus;
  declare shouldSyncNotes: boolean;
}
IntercomWorkspaceModel.init(
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
    intercomWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    conversationsSlidingWindow: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: DEFAULT_CONVERSATIONS_SLIDING_WINDOW,
    },
    syncAllConversations: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "disabled",
    },
    shouldSyncNotes: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    region: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "US",
    },
  },
  {
    sequelize: sequelizeConnection,
    indexes: [
      {
        fields: ["connectorId", "intercomWorkspaceId"],
        unique: true,
        name: "intercom_connector_workspace_idx",
      },
    ],
    modelName: "intercom_workspaces",
  }
);

export class IntercomHelpCenterModel extends ConnectorBaseModel<IntercomHelpCenterModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare intercomWorkspaceId: string;
  declare helpCenterId: string;

  declare name: string;
  declare identifier: string;
  declare websiteTurnedOn: boolean;

  declare lastUpsertedTs?: Date;
  declare permission: "read" | "none";
}
IntercomHelpCenterModel.init(
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
    intercomWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    helpCenterId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    identifier: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    websiteTurnedOn: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    permission: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    indexes: [
      {
        fields: ["connectorId", "helpCenterId"],
        unique: true,
        name: "intercom_connector_help_center_idx",
      },
      { fields: ["connectorId"] },
      { fields: ["helpCenterId"] },
    ],
    modelName: "intercom_help_centers",
  }
);

export class IntercomCollectionModel extends ConnectorBaseModel<IntercomCollectionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare intercomWorkspaceId: string;
  declare collectionId: string;

  declare helpCenterId: string;
  declare parentId: string | null;

  declare name: string;
  declare description: string | null;
  declare url: string;

  declare lastUpsertedTs?: Date;
  declare permission: "read" | "none";
}

IntercomCollectionModel.init(
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
    intercomWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    collectionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    helpCenterId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    parentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    permission: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    indexes: [
      {
        fields: ["connectorId", "collectionId"],
        unique: true,
        name: "intercom_connector_collection_idx",
      },
      { fields: ["connectorId"] },
      { fields: ["collectionId"] },
    ],
    modelName: "intercom_collections",
  }
);

export class IntercomArticleModel extends ConnectorBaseModel<IntercomArticleModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare intercomWorkspaceId: string;
  declare articleId: string;
  declare authorId: string;
  declare title: string;
  declare url: string;

  declare parentId: string | null;
  declare parentType: "collection" | null;
  declare parents: string[];

  declare state: "draft" | "published";

  declare lastUpsertedTs?: Date | null;
  declare permission: "read" | "none";
}

IntercomArticleModel.init(
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
    intercomWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    articleId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    authorId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    parentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parents: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    permission: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    indexes: [
      {
        fields: ["connectorId", "articleId"],
        unique: true,
        name: "intercom_connector_article_idx",
      },
      { fields: ["connectorId"] },
      { fields: ["articleId"] },
    ],
    modelName: "intercom_articles",
  }
);

export class IntercomTeamModel extends ConnectorBaseModel<IntercomTeamModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare teamId: string;
  declare name: string;

  declare lastUpsertedTs?: Date;
  declare permission: "read" | "none";
}

IntercomTeamModel.init(
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
    teamId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    permission: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    indexes: [
      {
        fields: ["connectorId", "teamId"],
        unique: true,
        name: "intercom_connector_team_idx",
      },
    ],
    modelName: "intercom_teams",
  }
);

export class IntercomConversationModel extends ConnectorBaseModel<IntercomConversationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: string;
  declare teamId: string | null;
  declare conversationCreatedAt: Date;

  declare lastUpsertedTs: Date;
}

IntercomConversationModel.init(
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
    conversationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    teamId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    conversationCreatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    indexes: [
      {
        fields: ["connectorId", "conversationId"],
        unique: true,
        name: "intercom_connector_conversation_idx",
      },
    ],
    modelName: "intercom_conversations",
  }
);
