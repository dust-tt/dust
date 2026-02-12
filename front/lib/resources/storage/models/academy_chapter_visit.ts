import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";

export class AcademyChapterVisitModel extends BaseModel<AcademyChapterVisitModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<UserModel["id"]>;
  declare user: NonAttribute<UserModel>;

  declare courseSlug: string;
  declare chapterSlug: string;
}

AcademyChapterVisitModel.init(
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
    courseSlug: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    chapterSlug: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "academy_chapter_visit",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["userId", "courseSlug", "chapterSlug"],
        unique: true,
        concurrently: true,
      },
      { fields: ["userId", "courseSlug"], concurrently: true },
      { fields: ["userId"], concurrently: true },
    ],
  }
);

UserModel.hasMany(AcademyChapterVisitModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});

AcademyChapterVisitModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
