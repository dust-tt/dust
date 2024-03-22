import type { ContentFragmentContentType } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { User } from "@app/lib/models/user";
import { frontSequelize } from "@app/lib/resources/storage";

export class ContentFragmentModel extends Model<
  InferAttributes<ContentFragmentModel>,
  InferCreationAttributes<ContentFragmentModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare title: string;
  declare content: string;
  declare url: string | null;
  declare contentType: ContentFragmentContentType;
  declare sourceUrl: string | null; // GCS (upload) or Slack or ...

  // Fields below are set of all types that can be transduced to text or
  // are textual in nature (PDF, text, CSV, future: .docx...)
  declare textUrl: string | null; // url to GCS
  declare textBytes: number | null; // number of textUrl bytes

  // user-related context
  declare userContextUsername: string | null;
  declare userContextFullName: string | null;
  declare userContextEmail: string | null;
  declare userContextProfilePictureUrl: string | null;

  declare userId: ForeignKey<User["id"]> | null;
}

ContentFragmentModel.init(
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
    title: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    contentType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sourceUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    textUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    textBytes: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    userContextProfilePictureUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userContextUsername: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userContextFullName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userContextEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "content_fragment",
    sequelize: frontSequelize,
  }
);

User.hasMany(ContentFragmentModel, {
  foreignKey: { name: "userId", allowNull: true }, // null = ContentFragment is not associated with a user
});
ContentFragmentModel.belongsTo(User, {
  foreignKey: { name: "userId", allowNull: true },
});
