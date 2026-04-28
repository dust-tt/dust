import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ProjectTodoSourceType } from "@app/types/project_todo";
import type { TodoVersionedActionItem } from "@app/types/takeaways";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

// ── Shared attributes ────────────────────────────────────────────────────────
// Used by both the main table and the version snapshot table so that
// TakeawaysVersionModel can extend TakeawaysModel without duplicating
// column definitions (same pattern as SkillVersionModel).

const TAKEAWAY_MODEL_ATTRIBUTES = {
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
  spaceId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    comment: "The space (project) this takeaway belongs to.",
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
} as const;

// ── Takeaways (main) ──────────────────────────────────────────────────────────
// One row per logical takeaway. The row's `id` is the stable identity used as a
// foreign key in TakeawaysVersionModel and TakeawaySourcesModel.
// Each butler run updates this row in place and appends a snapshot to
// TakeawaysVersionModel for history.
export class TakeawaysModel extends WorkspaceAwareModel<TakeawaysModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // The space (project) this takeaway belongs to.
  declare spaceId: ForeignKey<SpaceModel["id"]>;

  // Rolling state — full replacement on each butler run.
  declare actionItems: TodoVersionedActionItem[];
  declare notableFacts: [];
  declare keyDecisions: [];
}

TakeawaysModel.init(
  {
    ...TAKEAWAY_MODEL_ATTRIBUTES,
  },
  {
    modelName: "takeaways",
    tableName: "takeaways",
    sequelize: frontSequelize,
    indexes: [
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

// ── Takeaway versions ─────────────────────────────────────────────────────────
// Each butler run appends a new row here before overwriting the main row,
// preserving the full history. `takeawaysId` is the FK back to the stable
// TakeawaysModel row.
export class TakeawaysVersionModel extends TakeawaysModel {
  declare takeawaysId: ForeignKey<TakeawaysModel["id"]>;

  // Monotonically increasing per takeawaysId, starting at 1.
  declare version: number;
}

TakeawaysVersionModel.init(
  {
    ...TAKEAWAY_MODEL_ATTRIBUTES,
    takeawaysId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment:
        "Monotonically increasing per takeawaysId. Each butler run inserts a new row rather than overwriting.",
    },
  },
  {
    modelName: "takeaways_version",
    tableName: "takeaway_versions",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "takeaway_versions_ws_takeawaysId_version_unique_idx",
        fields: ["workspaceId", "takeawaysId", "version"],
        unique: true,
        concurrently: true,
      },
    ],
  }
);

TakeawaysVersionModel.belongsTo(TakeawaysModel, {
  foreignKey: { name: "takeawaysId", allowNull: false },
  onDelete: "RESTRICT",
  as: "takeaways",
});

TakeawaysModel.hasMany(TakeawaysVersionModel, {
  foreignKey: { name: "takeawaysId", allowNull: false },
  as: "versions",
});

// ── Source takeaways ──────────────────────────────────────────────────────────
// Content node (conversation, etc.) that triggered the production of a
// takeaway snapshot, linked to the stable TakeawaysModel row by its id.
export class TakeawaySourcesModel extends WorkspaceAwareModel<TakeawaySourcesModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // FK to the stable TakeawaysModel row that this source produced.
  declare takeawaysId: ForeignKey<TakeawaysModel["id"]>;
  declare sourceType: ProjectTodoSourceType;
  declare sourceId: string;

  declare sourceTitle: string | null;
  declare sourceUrl: string | null;
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
    takeawaysId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: "FK to the TakeawaysModel row this source produced.",
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
    sourceTitle: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    sourceUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    modelName: "takeaway_sources",
    tableName: "takeaway_sources",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "takeaway_sources_ws_takeawaysId_idx",
        fields: ["workspaceId", "takeawaysId"],
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

TakeawaySourcesModel.belongsTo(TakeawaysModel, {
  foreignKey: { name: "takeawaysId", allowNull: false },
  onDelete: "RESTRICT",
  as: "takeaways",
});

TakeawaysModel.hasMany(TakeawaySourcesModel, {
  foreignKey: { name: "takeawaysId", allowNull: false },
  as: "sources",
});
