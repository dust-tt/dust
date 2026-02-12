import type { Authenticator } from "@app/lib/auth";
import { AcademyChapterVisitResource } from "@app/lib/resources/academy_chapter_visit_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { AcademyContentType } from "@app/lib/resources/storage/models/academy_quiz_attempt";
import { AcademyQuizAttemptModel } from "@app/lib/resources/storage/models/academy_quiz_attempt";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { AcademyIdentifier } from "@app/types/academy";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, ModelStatic, Transaction } from "sequelize";
import { Op } from "sequelize";

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

  private static identifierWhere(identifier: AcademyIdentifier) {
    if (identifier.userId !== undefined) {
      return { userId: identifier.userId };
    }
    return { browserId: identifier.browserId };
  }

  private static identifierDefaults(identifier: AcademyIdentifier) {
    if (identifier.userId !== undefined) {
      return { userId: identifier.userId, browserId: null };
    }
    return { userId: null, browserId: identifier.browserId };
  }

  static async recordAttempt(
    identifier: AcademyIdentifier,
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
    const isPassed = correctAnswers >= PASSING_THRESHOLD;

    const attempt = await AcademyQuizAttemptModel.create({
      ...this.identifierDefaults(identifier),
      sId: generateRandomModelSId("aqz"),
      contentType,
      contentSlug,
      courseSlug: courseSlug ?? null,
      correctAnswers,
      totalQuestions,
      isPassed,
    });

    return new AcademyQuizAttemptResource(
      AcademyQuizAttemptModel,
      attempt.get()
    );
  }

  static async getProgressForContent(
    identifier: AcademyIdentifier,
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
        ...this.identifierWhere(identifier),
        contentType,
        contentSlug,
      },
      order: [["createdAt", "DESC"]],
    });

    if (attempts.length === 0) {
      return null;
    }

    const bestScore = Math.max(...attempts.map((a) => a.correctAnswers));
    const isCompleted = attempts.some((a) => a.isPassed);

    return {
      attemptCount: attempts.length,
      bestScore,
      isCompleted,
      lastAttemptAt: attempts[0].createdAt,
    };
  }

  static async getAllCourseProgress(identifier: AcademyIdentifier): Promise<
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
          ...this.identifierWhere(identifier),
          contentType: "chapter",
          courseSlug: { [Op.ne]: null },
        },
        order: [["createdAt", "DESC"]],
      }),
      AcademyChapterVisitResource.getAllVisits(identifier),
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
        if (attempt.isPassed) {
          completedSlugs.add(attempt.contentSlug);
        }
        courseMap.set(attempt.courseSlug, {
          completedChapterSlugs: completedSlugs,
          attemptedChapterSlugs: attemptedSlugs,
          lastAttemptAt: attempt.createdAt,
        });
      } else {
        existing.attemptedChapterSlugs.add(attempt.contentSlug);
        if (attempt.isPassed) {
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

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  static async deleteAllForUser(userId: ModelId): Promise<number> {
    return AcademyQuizAttemptModel.destroy({
      where: { userId },
    });
  }

  /**
   * Check if user/browser has ever achieved a passing score for this content.
   */
  static async hasPassingScore(
    identifier: AcademyIdentifier,
    contentType: AcademyContentType,
    contentSlug: string
  ): Promise<boolean> {
    const count = await AcademyQuizAttemptModel.count({
      where: {
        ...this.identifierWhere(identifier),
        contentType,
        contentSlug,
        isPassed: true,
      },
    });

    return count > 0;
  }

  /**
   * Backfill anonymous attempts: assign userId to rows that match the given
   * browserId and have no userId yet.
   */
  static async backfillBrowserId(
    browserId: string,
    userId: ModelId
  ): Promise<number> {
    const [affectedCount] = await AcademyQuizAttemptModel.update(
      { userId, browserId: null },
      { where: { browserId, userId: { [Op.is]: null } } }
    );

    return affectedCount;
  }
}
