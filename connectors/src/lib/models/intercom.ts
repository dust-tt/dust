import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import type { IntercomSyncAllConversationsStatus } from "@connectors/connectors/intercom/lib/types";
import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import { BaseModel } from "@connectors/resources/storage/wrappers";

export class IntercomWorkspace extends BaseModel<IntercomWorkspace> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare intercomWorkspaceId: string;
  declare name: string;
  declare region: string;

  declare conversationsSlidingWindow: number;
  declare syncAllConversations: IntercomSyncAllConversationsStatus;
  declare shouldSyncNotes: boolean;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}
IntercomWorkspace.init(
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
      defaultValue: 90,
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
ConnectorModel.hasMany(IntercomWorkspace);

export class IntercomHelpCenter extends BaseModel<IntercomHelpCenter> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare intercomWorkspaceId: string;
  declare helpCenterId: string;

  declare name: string;
  declare identifier: string;
  declare websiteTurnedOn: boolean;

  declare lastUpsertedTs?: Date;
  declare permission: "read" | "none";

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}
IntercomHelpCenter.init(
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
ConnectorModel.hasMany(IntercomHelpCenter);

export class IntercomCollection extends BaseModel<IntercomCollection> {
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

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}

IntercomCollection.init(
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
      type: DataTypes.STRING,
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
ConnectorModel.hasMany(IntercomCollection);

export class IntercomArticle extends BaseModel<IntercomArticle> {
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

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}

IntercomArticle.init(
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
ConnectorModel.hasMany(IntercomArticle);

export class IntercomTeam extends BaseModel<IntercomTeam> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare teamId: string;
  declare name: string;

  declare lastUpsertedTs?: Date;
  declare permission: "read" | "none";

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}

IntercomTeam.init(
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
ConnectorModel.hasMany(IntercomTeam);

export class IntercomConversation extends BaseModel<IntercomConversation> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: string;
  declare teamId: string | null;
  declare conversationCreatedAt: Date;

  declare lastUpsertedTs: Date;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}

IntercomConversation.init(
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
ConnectorModel.hasMany(IntercomConversation);
