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

export class ContentFragment extends Model<
  InferAttributes<ContentFragment>,
  InferCreationAttributes<ContentFragment>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare title: string;
  declare content: string;
  declare url: string | null;
  declare contentType: ContentFragmentContentType;

  declare userContextUsername: string | null;
  declare userContextFullName: string | null;
  declare userContextEmail: string | null;
  declare userContextProfilePictureUrl: string | null;

  declare userId: ForeignKey<User["id"]> | null;
}

ContentFragment.init(
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

User.hasMany(ContentFragment, {
  foreignKey: { name: "userId", allowNull: true }, // null = ContentFragment is not associated with a user
});
ContentFragment.belongsTo(User, {
  foreignKey: { name: "userId", allowNull: true },
});
