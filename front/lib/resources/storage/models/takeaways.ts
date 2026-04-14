import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ProjectTodoSourceType } from "@app/types/project_todo";
import type {
  TodoVersionedActionItem,
  TodoVersionedKeyDecision,
  TodoVersionedNotableFact,
} from "@app/types/takeaways";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

// ── Takeaways (versioned) ─────────────────────────────────────────────────────
// Versioned snapshot of butler-extracted takeaways (action items, notable
// facts, key decisions). Each butler run appends a new row; the sId is stable
// across all versions of the same logical takeaway.
export class TakeawaysModel extends WorkspaceAwareModel<TakeawaysModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // The space (project) this takeaway belongs to.
  declare spaceId: ForeignKey<SpaceModel["id"]>;

  // Stable identity: same sId across all version rows of one logical takeaway.
  declare sId: string;

  // Versioning: each butler run appends a new row. Version is monotonically
  // increasing per sId, starting at 1.
  declare version: number;

  // Rolling state — full replacement on each run.
  declare actionItems: TodoVersionedActionItem[];
  declare notableFacts: TodoVersionedNotableFact[];
  declare keyDecisions: TodoVersionedKeyDecision[];
}

TakeawaysModel.init(
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
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
      comment:
        "Stable identifier shared across all version rows of the same logical takeaway.",
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment:
        "Monotonically increasing per sId. Each butler run inserts a new row rather than overwriting.",
    },
    actionItems: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment:
        "Detected action items with assignee, status, and source message rank.",
    },
    notableFacts: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: "Notable facts extracted from the conversation.",
    },
    keyDecisions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: "Key decisions made during the conversation.",
    },
    spaceId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: { model: "vaults", key: "id" },
      comment: "The space (project) this takeaway belongs to.",
    },
  },
  {
    modelName: "takeaways",
    tableName: "takeaways",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "takeaways_ws_sId_version_unique_idx",
        fields: ["workspaceId", "sId", "version"],
        unique: true,
        concurrently: true,
      },
      {
        name: "takeaways_sId_idx",
        fields: ["sId"],
        concurrently: true,
      },
      {
        name: "takeaways_spaceId_idx",
        fields: ["spaceId"],
        concurrently: true,
      },
    ],
  }
);

TakeawaysModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "RESTRICT",
});

// ── Source takeaways ──────────────────────────────────────────────────────────
// Content node (conversation, etc.) that triggered the production of a
// takeaway snapshot, linked to the snapshot by its stable sId.
export class TakeawaySourcesModel extends WorkspaceAwareModel<TakeawaySourcesModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // References the stable sId of the takeaway this source produced.
  declare takeawaySId: string;
  declare sourceType: ProjectTodoSourceType;
  declare sourceId: string;
}

TakeawaySourcesModel.init(
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
    takeawaySId: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Stable sId of the takeaway this source produced.",
    },
    sourceType: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Type of content node that produced this takeaway.",
    },
    sourceId: {
      type: DataTypes.STRING,
      allowNull: false,
      comment:
        "String identifier of the source (internal SID or external URL/ID) that produced this takeaway.",
    },
  },
  {
    modelName: "takeaway_sources",
    tableName: "takeaway_sources",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "takeaway_sources_ws_takeawaySId_idx",
        fields: ["workspaceId", "takeawaySId"],
        concurrently: true,
      },
      {
        name: "takeaway_sources_sourceType_sourceId_idx",
        fields: ["sourceType", "sourceId"],
        concurrently: true,
      },
    ],
  }
);
