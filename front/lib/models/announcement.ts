import type { CreationOptional, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import type {
  AnnouncementType,
  ChangelogCategory,
} from "@app/types/announcement";
import { ANNOUNCEMENT_TYPES } from "@app/types/announcement";

import { frontSequelize } from "../resources/storage";
import { BaseModel } from "../resources/storage/wrappers/base";

export class AnnouncementModel extends BaseModel<AnnouncementModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare type: AnnouncementType;
  declare slug: string;
  declare title: string;
  declare description: string;
  declare content: string; // HTML content
  declare publishedAt: Date | null;
  declare isPublished: boolean;
  declare showInAppBanner: boolean;

  // Event-specific fields
  declare eventDate: Date | null;
  declare eventTimezone: string | null;
  declare eventLocation: string | null;
  declare eventUrl: string | null;

  // Changelog-specific fields
  declare categories: ChangelogCategory[] | null;
  declare tags: string[] | null;

  // Image
  declare imageFileId: string | null;

  declare dismissedByUsers: NonAttribute<AnnouncementBannerDismissalModel[]>;
}

AnnouncementModel.init(
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
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [ANNOUNCEMENT_TYPES],
      },
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    showInAppBanner: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    eventDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    eventTimezone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    eventLocation: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    eventUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    categories: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    tags: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    imageFileId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "announcement",
    indexes: [
      { fields: ["slug"], unique: true },
      { fields: ["type"] },
      { fields: ["publishedAt"] },
      { fields: ["isPublished"] },
      { fields: ["showInAppBanner"] },
      { fields: ["eventDate"] },
    ],
  }
);

export class AnnouncementBannerDismissalModel extends BaseModel<AnnouncementBannerDismissalModel> {
  declare createdAt: CreationOptional<Date>;
  declare announcementId: number;
  declare userId: number;
}

AnnouncementBannerDismissalModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    announcementId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "announcements",
        key: "id",
      },
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "announcement_banner_dismissal",
    indexes: [
      {
        unique: true,
        fields: ["announcementId", "userId"],
      },
      { fields: ["userId"] },
    ],
    timestamps: false,
  }
);

// Set up associations
AnnouncementModel.hasMany(AnnouncementBannerDismissalModel, {
  foreignKey: "announcementId",
  as: "dismissedByUsers",
});
AnnouncementBannerDismissalModel.belongsTo(AnnouncementModel, {
  foreignKey: "announcementId",
});
