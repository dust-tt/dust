import { frontSequelize } from "@app/lib/resources/storage";
import type {
  CreationOptional,
  ForeignKey,
} from "@app/lib/resources/storage/data_types";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { FrameToolCallPair } from "@app/types/api/frame_publication";
import {
  FRAME_TOOL_CALL_REF_MAX_LENGTH,
  FrameToolCallPairSchema,
} from "@app/types/api/frame_publication";

/**
 * Per-user authorization of the tools a Frame's active publication may call.
 * `authorizedTools` is the snapshot the user consented to; a later publication
 * whose `requiredTools` is not a subset requires re-consent.
 */
export class FrameToolAuthorizationModel extends WorkspaceAwareModel<FrameToolAuthorizationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare fileId: ForeignKey<FileModel["id"]>;
  declare userId: ForeignKey<UserModel["id"]>;
  declare authorizedTools: CreationOptional<FrameToolCallPair[]>;
}

function assertAuthorizedTools(
  value: unknown
): asserts value is FrameToolCallPair[] {
  if (!Array.isArray(value)) {
    throw new Error(
      "authorizedTools must be an array of [server, tool] pairs."
    );
  }
  for (const pair of value) {
    const parsed = FrameToolCallPairSchema.safeParse(pair);
    if (!parsed.success) {
      throw new Error(
        "authorizedTools entries must be length-2 string pairs " +
          `(non-empty, at most ${FRAME_TOOL_CALL_REF_MAX_LENGTH} characters each).`
      );
    }
  }
}

FrameToolAuthorizationModel.init(
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
    userId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    authorizedTools: {
      type: DataTypes.ARRAY(DataTypes.ARRAY(DataTypes.STRING(255))),
      allowNull: false,
      defaultValue: [],
      validate: {
        isToolCallPairs(value: unknown) {
          assertAuthorizedTools(value);
        },
      },
    },
  },
  {
    modelName: "frame_tool_authorization",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "fileId", "userId"],
        unique: true,
        concurrently: true,
      },
      {
        fields: ["fileId"],
        concurrently: true,
      },
      {
        fields: ["userId"],
        concurrently: true,
      },
    ],
  }
);

FrameToolAuthorizationModel.belongsTo(FileModel, {
  foreignKey: { name: "fileId", allowNull: false },
  onDelete: "CASCADE",
});
FileModel.hasMany(FrameToolAuthorizationModel, {
  foreignKey: { name: "fileId", allowNull: false },
  onDelete: "CASCADE",
});

FrameToolAuthorizationModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "CASCADE",
});
UserModel.hasMany(FrameToolAuthorizationModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "CASCADE",
});
