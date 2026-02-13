import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";

export const ACADEMY_CONTENT_TYPES = ["course", "lesson", "chapter"] as const;
export type AcademyContentType = (typeof ACADEMY_CONTENT_TYPES)[number];

export class AcademyQuizAttemptModel extends BaseModel<AcademyQuizAttemptModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<UserModel["id"]> | null;
  declare user: NonAttribute<UserModel>;

  declare browserId: string | null;
  declare contentType: AcademyContentType;
  declare contentSlug: string;
  declare courseSlug: string | null;

  declare correctAnswers: number;
  declare totalQuestions: number;
  declare isPerfect: boolean;
}

AcademyQuizAttemptModel.init(
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
    contentType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [ACADEMY_CONTENT_TYPES],
      },
    },
    contentSlug: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    courseSlug: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    correctAnswers: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    totalQuestions: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    isPerfect: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
  },
  {
    modelName: "academy_quiz_attempt",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["userId"], concurrently: true },
      {
        fields: ["userId", "contentType", "contentSlug"],
        concurrently: true,
      },
      { fields: ["userId", "courseSlug"], concurrently: true },
      { fields: ["browserId"], concurrently: true },
      {
        fields: ["browserId", "contentType", "contentSlug"],
        concurrently: true,
      },
      { fields: ["browserId", "courseSlug"], concurrently: true },
    ],
  }
);

UserModel.hasMany(AcademyQuizAttemptModel, {
  foreignKey: { name: "userId", allowNull: true },
  onDelete: "RESTRICT",
});

AcademyQuizAttemptModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: true },
  onDelete: "RESTRICT",
});
