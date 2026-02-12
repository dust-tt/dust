import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { AcademyChapterVisitModel } from "@app/lib/resources/storage/models/academy_chapter_visit";
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
export interface AcademyChapterVisitResource
  extends ReadonlyAttributesType<AcademyChapterVisitModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AcademyChapterVisitResource extends BaseResource<AcademyChapterVisitModel> {
  static model: ModelStatic<AcademyChapterVisitModel> =
    AcademyChapterVisitModel;

  constructor(
    model: ModelStatic<AcademyChapterVisitModel>,
    blob: Attributes<AcademyChapterVisitModel>
  ) {
    super(AcademyChapterVisitModel, blob);
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

  static async recordVisit(
    identifier: AcademyIdentifier,
    courseSlug: string,
    chapterSlug: string
  ): Promise<void> {
    const where = {
      ...this.identifierWhere(identifier),
      courseSlug,
      chapterSlug,
    };

    const [visit, created] = await AcademyChapterVisitModel.findOrCreate({
      where,
      defaults: {
        ...this.identifierDefaults(identifier),
        sId: generateRandomModelSId("acv"),
        courseSlug,
        chapterSlug,
      },
    });

    // Update updatedAt on revisit.
    if (!created) {
      await visit.update({ updatedAt: new Date() });
    }
  }

  static async getAllVisits(
    identifier: AcademyIdentifier
  ): Promise<AcademyChapterVisitResource[]> {
    const visits = await AcademyChapterVisitModel.findAll({
      where: this.identifierWhere(identifier),
      order: [["updatedAt", "DESC"]],
    });

    return visits.map(
      (v) => new AcademyChapterVisitResource(AcademyChapterVisitModel, v.get())
    );
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  static async deleteAllForUser(userId: ModelId): Promise<number> {
    return AcademyChapterVisitModel.destroy({
      where: { userId },
    });
  }

  /**
   * Backfill anonymous visits: assign userId to rows that match the given
   * browserId and have no userId yet. If the user already has a visit for the
   * same (courseSlug, chapterSlug), the anonymous duplicate is deleted instead.
   */
  static async backfillBrowserId(
    browserId: string,
    userId: ModelId
  ): Promise<number> {
    const anonymousVisits = await AcademyChapterVisitModel.findAll({
      where: { browserId, userId: { [Op.is]: null } },
    });

    if (anonymousVisits.length === 0) {
      return 0;
    }

    // Fetch existing visits for this user to detect conflicts.
    const existingVisits = await AcademyChapterVisitModel.findAll({
      where: { userId },
      attributes: ["courseSlug", "chapterSlug"],
    });
    const existingKeys = new Set(
      existingVisits.map((v) => `${v.courseSlug}::${v.chapterSlug}`)
    );

    // TODO: Replace with a bulk UPDATE + DELETE using a subquery if visit
    // counts grow large. Current O(n) loop is fine for expected volumes
    // (< 50 visits per anonymous session).
    let backfilled = 0;
    for (const visit of anonymousVisits) {
      const key = `${visit.courseSlug}::${visit.chapterSlug}`;
      if (existingKeys.has(key)) {
        // User already has this visit — delete the anonymous one.
        await visit.destroy();
      } else {
        await visit.update({ userId, browserId: null });
        existingKeys.add(key);
        backfilled++;
      }
    }

    return backfilled;
  }
}
