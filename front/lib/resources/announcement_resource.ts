import type {
  Attributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import {
  AnnouncementBannerDismissalModel,
  AnnouncementModel,
} from "@app/lib/models/announcement";
import { BaseResource } from "@app/lib/resources/base_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelId, Result } from "@app/types";
import { Err, Ok } from "@app/types";
import type {
  AnnouncementContentType,
  AnnouncementType,
} from "@app/types/announcement";

// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface AnnouncementResource
  extends ReadonlyAttributesType<AnnouncementModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AnnouncementResource extends BaseResource<AnnouncementModel> {
  static model: ModelStatic<AnnouncementModel> = AnnouncementModel;

  constructor(
    model: ModelStatic<AnnouncementModel>,
    blob: Attributes<AnnouncementModel>
  ) {
    super(AnnouncementModel, blob);
  }

  static async makeNew(
    blob: Omit<Attributes<AnnouncementModel>, "id" | "createdAt" | "updatedAt">
  ): Promise<AnnouncementResource> {
    const announcement = await AnnouncementModel.create(blob);
    return new this(AnnouncementModel, announcement.get());
  }

  static async fetchById(id: ModelId): Promise<AnnouncementResource | null> {
    const announcement = await AnnouncementModel.findByPk(id);
    if (!announcement) {
      return null;
    }
    return new this(AnnouncementModel, announcement.get());
  }

  static async fetchBySId(sId: string): Promise<AnnouncementResource | null> {
    const announcement = await AnnouncementModel.findOne({
      where: { sId },
    });
    if (!announcement) {
      return null;
    }
    return new this(AnnouncementModel, announcement.get());
  }

  static async fetchBySlug(slug: string): Promise<AnnouncementResource | null> {
    const announcement = await AnnouncementModel.findOne({
      where: { slug },
    });
    if (!announcement) {
      return null;
    }
    return new this(AnnouncementModel, announcement.get());
  }

  static async listPublished({
    type,
    limit,
    offset = 0,
  }: {
    type?: AnnouncementType;
    limit?: number;
    offset?: number;
  }): Promise<AnnouncementResource[]> {
    const where: WhereOptions<AnnouncementModel> = {
      isPublished: true,
      publishedAt: {
        [Op.lte]: new Date(),
      },
    };

    if (type) {
      where.type = type;
    }

    const announcements = await AnnouncementModel.findAll({
      where,
      order: [["publishedAt", "DESC"]],
      limit,
      offset,
    });

    return announcements.map(
      (a) => new AnnouncementResource(AnnouncementModel, a.get())
    );
  }

  static async listAll({
    type,
    isPublished,
    limit,
    offset = 0,
  }: {
    type?: AnnouncementType;
    isPublished?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<AnnouncementResource[]> {
    const where: WhereOptions<AnnouncementModel> = {};

    if (type) {
      where.type = type;
    }
    if (isPublished !== undefined) {
      where.isPublished = isPublished;
    }

    const announcements = await AnnouncementModel.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return announcements.map(
      (a) => new AnnouncementResource(AnnouncementModel, a.get())
    );
  }

  static async getLatestBannerAnnouncement(): Promise<AnnouncementResource | null> {
    const announcement = await AnnouncementModel.findOne({
      where: {
        isPublished: true,
        showInAppBanner: true,
        publishedAt: {
          [Op.lte]: new Date(),
        },
      },
      order: [["publishedAt", "DESC"]],
    });

    if (!announcement) {
      return null;
    }

    return new this(AnnouncementModel, announcement.get());
  }

  async update(
    blob: Partial<Attributes<AnnouncementModel>>,
    transaction?: Transaction
  ): Promise<[affectedCount: number]> {
    return await super.update(blob, transaction);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await AnnouncementModel.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (error) {
      return new Err(error as Error);
    }
  }

  async isDismissedByUser(userId: ModelId): Promise<boolean> {
    const dismissal = await AnnouncementBannerDismissalModel.findOne({
      where: {
        announcementId: this.id,
        userId,
      },
    });
    return !!dismissal;
  }

  static async dismissBannerForUser(
    announcementId: ModelId,
    userId: ModelId
  ): Promise<Result<void, Error>> {
    try {
      await AnnouncementBannerDismissalModel.findOrCreate({
        where: {
          announcementId,
          userId,
        },
        defaults: {
          announcementId,
          userId,
        },
      });
      return new Ok(undefined);
    } catch (error) {
      return new Err(error as Error);
    }
  }

  toJSON(): AnnouncementContentType {
    return {
      id: this.id,
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      type: this.type,
      slug: this.slug,
      title: this.title,
      description: this.description,
      content: this.content,
      publishedAt: this.publishedAt ? this.publishedAt.getTime() : null,
      isPublished: this.isPublished,
      showInAppBanner: this.showInAppBanner,
      eventDate: this.eventDate ? this.eventDate.getTime() : null,
      eventTimezone: this.eventTimezone,
      eventLocation: this.eventLocation,
      eventUrl: this.eventUrl,
      categories: this.categories,
      tags: this.tags,
      imageFileId: this.imageFileId,
      imageUrl: null, // Can be populated by getImageUrl if needed
    };
  }

  async getImageUrl(auth: Authenticator): Promise<string | null> {
    if (!this.imageFileId) {
      return null;
    }

    const imageFile = await FileResource.fetchById(auth, this.imageFileId);
    if (!imageFile) {
      return null;
    }

    return imageFile.getPublicUrl(auth);
  }
}
