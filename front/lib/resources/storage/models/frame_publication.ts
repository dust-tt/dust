import { frontSequelize } from "@app/lib/resources/storage";
import type {
  CreationOptional,
  ForeignKey,
} from "@app/lib/resources/storage/data_types";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  FramePublicationAllowlist,
  FrameToolCallPair,
} from "@app/types/api/frame_publication";
import {
  FRAME_TOOL_CALL_REF_MAX_LENGTH,
  FrameToolCallPairSchema,
} from "@app/types/api/frame_publication";

/**
 * One row per immutable Frames v2 publication; `createdAt` is its publication time. The
 * publication's content lives in GCS under `publications/<publicationId>/`, committed by its
 * `publication.json`. Which publication a Frame serves is still recorded on the Frame
 * (`useCaseMetadata.activePublicationId`).
 */
export class FramePublicationModel extends WorkspaceAwareModel<FramePublicationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare fileId: ForeignKey<FileModel["id"]>;
  declare publicationId: string;
  declare publishedByUserId: ForeignKey<UserModel["id"]> | null;
  /**
   * Frame-level union of literal tools.call(server, tool) pairs from the publication's
   * function contracts. Each inner array is exactly `[server, tool]`.
   */
  declare requiredTools: CreationOptional<FrameToolCallPair[]>;
  /**
   * Share allowlist computed when this publication was published. Null for publications from
   * before it was stored; activation then computes it.
   */
  declare authorizedFileAccess: CreationOptional<FramePublicationAllowlist | null>;
}

function assertRequiredTools(
  value: unknown
): asserts value is FrameToolCallPair[] {
  if (!Array.isArray(value)) {
    throw new Error("requiredTools must be an array of [server, tool] pairs.");
  }
  for (const pair of value) {
    const parsed = FrameToolCallPairSchema.safeParse(pair);
    if (!parsed.success) {
      throw new Error(
        "requiredTools entries must be length-2 string pairs " +
          `(non-empty, at most ${FRAME_TOOL_CALL_REF_MAX_LENGTH} characters each).`
      );
    }
  }
}

FramePublicationModel.init(
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
    fileId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    publicationId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    requiredTools: {
      type: DataTypes.ARRAY(DataTypes.ARRAY(DataTypes.STRING(255))),
      allowNull: false,
      defaultValue: [],
      validate: {
        isToolCallPairs(value: unknown) {
          assertRequiredTools(value);
        },
      },
    },
    authorizedFileAccess: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "frame_publication",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "fileId", "publicationId"],
        unique: true,
        concurrently: true,
      },
      {
        fields: ["fileId"],
        concurrently: true,
      },
      {
        fields: ["publishedByUserId"],
        concurrently: true,
      },
    ],
  }
);

FramePublicationModel.belongsTo(FileModel, {
  foreignKey: { name: "fileId", allowNull: false },
  onDelete: "RESTRICT",
});
FileModel.hasMany(FramePublicationModel, {
  foreignKey: { name: "fileId", allowNull: false },
  onDelete: "RESTRICT",
});

FramePublicationModel.belongsTo(UserModel, {
  foreignKey: { name: "publishedByUserId", allowNull: true },
  onDelete: "SET NULL",
});
UserModel.hasMany(FramePublicationModel, {
  foreignKey: { name: "publishedByUserId", allowNull: true },
  onDelete: "SET NULL",
});
