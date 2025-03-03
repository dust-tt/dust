import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { Conversation } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class DataSourceViewForConversation extends WorkspaceAwareModel<DataSourceViewForConversation> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: ForeignKey<Conversation["id"]>;
  declare dataSourceViewId: ForeignKey<DataSourceViewModel["id"]>;
}

DataSourceViewForConversation.init(
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
    modelName: "data_source_view_for_conversations",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["conversationId", "dataSourceViewId"],
      },
      { fields: ["conversationId"], concurrently: true },
      { fields: ["dataSourceViewId"], concurrently: true },
    ],
  }
);

Conversation.hasMany(DataSourceViewForConversation, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
});
DataSourceViewForConversation.belongsTo(Conversation, {
  foreignKey: { name: "conversationId", allowNull: false },
});

DataSourceViewModel.hasMany(DataSourceViewForConversation, {
  foreignKey: { name: "dataSourceViewId", allowNull: false },
  onDelete: "RESTRICT",
});
DataSourceViewForConversation.belongsTo(DataSourceViewModel, {
  foreignKey: { name: "dataSourceViewId", allowNull: false },
});
