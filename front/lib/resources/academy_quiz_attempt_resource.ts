import type { Attributes, ModelStatic, Transaction } from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { AcademyChapterVisitModel } from "@app/lib/resources/storage/models/academy_chapter_visit";
import type { AcademyContentType } from "@app/lib/resources/storage/models/academy_quiz_attempt";
import { AcademyQuizAttemptModel } from "@app/lib/resources/storage/models/academy_quiz_attempt";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AcademyQuizAttemptResource
  extends ReadonlyAttributesType<AcademyQuizAttemptModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AcademyQuizAttemptResource extends BaseResource<AcademyQuizAttemptModel> {
  static model: ModelStatic<AcademyQuizAttemptModel> = AcademyQuizAttemptModel;

  constructor(
    model: ModelStatic<AcademyQuizAttemptModel>,
    blob: Attributes<AcademyQuizAttemptModel>
  ) {
    super(AcademyQuizAttemptModel, blob);
  }

  async delete(
    _auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: { id: this.id },
      transaction,
    });

    return new Ok(undefined);
  }

  static async recordAttempt(
    user: UserResource,
    {
      contentType,
      contentSlug,
      courseSlug,
      correctAnswers,
      totalQuestions,
    }: {
      contentType: AcademyContentType;
      contentSlug: string;
      courseSlug?: string;
      correctAnswers: number;
      totalQuestions: number;
    }
  ): Promise<AcademyQuizAttemptResource> {
    // A score of 3 or more out of 5 is considered passing.
    const PASSING_THRESHOLD = 3;
    const isPerfect = correctAnswers >= PASSING_THRESHOLD;

    const attempt = await AcademyQuizAttemptModel.create({
      userId: user.id,
      contentType,
      contentSlug,
      courseSlug: courseSlug ?? null,
      correctAnswers,
      totalQuestions,
      isPerfect,
    });

    return new AcademyQuizAttemptResource(
      AcademyQuizAttemptModel,
      attempt.get()
    );
  }

  static async recordChapterVisit(
    user: UserResource,
    courseSlug: string,
    chapterSlug: string
  ): Promise<void> {
    const [visit, created] = await AcademyChapterVisitModel.findOrCreate({
      where: {
        userId: user.id,
        courseSlug,
        chapterSlug,
      },
      defaults: {
        userId: user.id,
        courseSlug,
        chapterSlug,
      },
    });

    // Update updatedAt on revisit.
    if (!created) {
      await visit.update({ updatedAt: new Date() });
    }
  }

  static async getProgressForContent(
    user: UserResource,
    contentType: AcademyContentType,
    contentSlug: string
  ): Promise<{
    attemptCount: number;
    bestScore: number;
    isCompleted: boolean;
    lastAttemptAt: Date;
  } | null> {
    const attempts = await AcademyQuizAttemptModel.findAll({
      where: {
        userId: user.id,
        contentType,
        contentSlug,
      },
      order: [["createdAt", "DESC"]],
    });

    if (attempts.length === 0) {
      return null;
    }

    const bestScore = Math.max(...attempts.map((a) => a.correctAnswers));
    const isCompleted = attempts.some((a) => a.isPerfect);

    return {
      attemptCount: attempts.length,
      bestScore,
      isCompleted,
      lastAttemptAt: attempts[0].createdAt,
    };
  }

  static async getAllCourseProgress(user: UserResource): Promise<
    Map<
      string,
      {
        completedChapterSlugs: string[];
        attemptedChapterSlugs: string[];
        lastAttemptAt: Date;
      }
    >
  > {
    const [attempts, visits] = await Promise.all([
      AcademyQuizAttemptModel.findAll({
        where: {
          userId: user.id,
          contentType: "chapter",
          courseSlug: { [Op.ne]: null },
        },
        order: [["createdAt", "DESC"]],
      }),
      AcademyChapterVisitModel.findAll({
        where: { userId: user.id },
        order: [["updatedAt", "DESC"]],
      }),
    ]);

    const courseMap = new Map<
      string,
      {
        completedChapterSlugs: Set<string>;
        attemptedChapterSlugs: Set<string>;
        lastAttemptAt: Date;
      }
    >();

    for (const attempt of attempts) {
      if (!attempt.courseSlug) {
        continue;
      }

      const existing = courseMap.get(attempt.courseSlug);
      if (!existing) {
        const completedSlugs = new Set<string>();
        const attemptedSlugs = new Set<string>();
        attemptedSlugs.add(attempt.contentSlug);
        if (attempt.isPerfect) {
          completedSlugs.add(attempt.contentSlug);
        }
        courseMap.set(attempt.courseSlug, {
          completedChapterSlugs: completedSlugs,
          attemptedChapterSlugs: attemptedSlugs,
          lastAttemptAt: attempt.createdAt,
        });
      } else {
        existing.attemptedChapterSlugs.add(attempt.contentSlug);
        if (attempt.isPerfect) {
          existing.completedChapterSlugs.add(attempt.contentSlug);
        }
      }
    }

    // Merge chapter visits into progress.
    for (const visit of visits) {
      const existing = courseMap.get(visit.courseSlug);
      if (!existing) {
        courseMap.set(visit.courseSlug, {
          completedChapterSlugs: new Set<string>(),
          attemptedChapterSlugs: new Set<string>([visit.chapterSlug]),
          lastAttemptAt: visit.updatedAt,
        });
      } else {
        existing.attemptedChapterSlugs.add(visit.chapterSlug);
        if (visit.updatedAt > existing.lastAttemptAt) {
          existing.lastAttemptAt = visit.updatedAt;
        }
      }
    }

    // Convert Sets to arrays for the return value.
    const result = new Map<
      string,
      {
        completedChapterSlugs: string[];
        attemptedChapterSlugs: string[];
        lastAttemptAt: Date;
      }
    >();
    for (const [courseSlug, data] of courseMap) {
      result.set(courseSlug, {
        completedChapterSlugs: [...data.completedChapterSlugs],
        attemptedChapterSlugs: [...data.attemptedChapterSlugs],
        lastAttemptAt: data.lastAttemptAt,
      });
    }

    return result;
  }

  static async deleteAllForUser(userId: ModelId): Promise<number> {
    return AcademyQuizAttemptModel.destroy({
      where: { userId },
    });
  }

  /**
   * Check if user has ever achieved a perfect score for this content.
   */
  static async hasPerfectScore(
    user: UserResource,
    contentType: AcademyContentType,
    contentSlug: string
  ): Promise<boolean> {
    const count = await AcademyQuizAttemptModel.count({
      where: {
        userId: user.id,
        contentType,
        contentSlug,
        isPerfect: true,
      },
    });

    return count > 0;
  }
}
