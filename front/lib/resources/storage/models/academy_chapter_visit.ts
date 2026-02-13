import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes, Op } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";

export class AcademyChapterVisitModel extends BaseModel<AcademyChapterVisitModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<UserModel["id"]> | null;
  declare user: NonAttribute<UserModel>;

  declare browserId: string | null;
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
    browserId: {
      type: DataTypes.STRING,
      allowNull: true,
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
        name: "academy_chapter_visits_user_id_course_chapter_unique",
        where: { userId: { [Op.ne]: null } },
        concurrently: true,
      },
      {
        fields: ["browserId", "courseSlug", "chapterSlug"],
        unique: true,
        name: "academy_chapter_visits_browser_id_course_chapter_unique",
        where: { browserId: { [Op.ne]: null } },
        concurrently: true,
      },
      { fields: ["userId", "courseSlug"], concurrently: true },
      { fields: ["userId"], concurrently: true },
      { fields: ["browserId"], concurrently: true },
    ],
  }
);

UserModel.hasMany(AcademyChapterVisitModel, {
  foreignKey: { name: "userId", allowNull: true },
  onDelete: "RESTRICT",
});

AcademyChapterVisitModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: true },
  onDelete: "RESTRICT",
});
