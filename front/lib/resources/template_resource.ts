import type { Result, TemplateVisibility } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";

import { makeUrlForEmojiAndBackgroud } from "@app/components/assistant_builder/avatar_picker/utils";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { TemplateModel } from "@app/lib/resources/storage/models/templates";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TemplateResource
  extends ReadonlyAttributesType<TemplateModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TemplateResource extends BaseResource<TemplateModel> {
  static model: ModelStatic<TemplateModel> = TemplateModel;

  constructor(
    model: ModelStatic<TemplateModel>,
    blob: Attributes<TemplateModel>
  ) {
    super(TemplateModel, blob);
  }

  static async makeNew(blob: CreationAttributes<TemplateModel>) {
    const template = await TemplateModel.create({
      ...blob,
    });

    return new this(TemplateModel, template.get());
  }

  // TODO(2024-03-27 flav) Move this to the `BaseResource`.
  static async fetchByExternalId(
    sId: string,
    transaction?: Transaction
  ): Promise<TemplateResource | null> {
    const blob = await this.model.findOne({
      where: {
        sId,
      },
      transaction,
    });
    if (!blob) {
      return null;
    }

    // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
    return new TemplateResource(this.model, blob.get());
  }

  static async listAll({
    visibility,
  }: { visibility?: TemplateVisibility } = {}) {
    const where: WhereOptions<TemplateModel> = {};
    if (visibility) {
      where.visibility = visibility;
    }

    const blobs = await TemplateResource.model.findAll({
      where,
      order: [["handle", "ASC"]],
    });

    return blobs.map(
      // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
      (b) => new TemplateResource(this.model, b.get())
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  async updateAttributes(
    blob: Partial<Omit<Attributes<TemplateModel>, "id">>,
    transaction?: Transaction
  ): Promise<[affectedCount: number]> {
    return this.update(blob, transaction);
  }

  isPublished() {
    return this.visibility === "published";
  }

  get pictureUrl() {
    const [id, unified] = this.emoji ? this.emoji.split("/") : [];

    return makeUrlForEmojiAndBackgroud(
      {
        id,
        unified,
        native: "",
      },
      this.backgroundColor as `bg-${string}`
    );
  }

  toListJSON() {
    return {
      description: this.description,
      handle: this.handle,
      pictureUrl: this.pictureUrl,
      sId: this.sId,
      tags: this.tags,
      visibility: this.visibility,
    };
  }

  toJSON() {
    return {
      backgroundColor: this.backgroundColor,
      description: this.description,
      emoji: this.emoji,
      handle: this.handle,
      helpActions: this.helpActions,
      helpInstructions: this.helpInstructions,
      pictureUrl: this.pictureUrl,
      presetActions: this.presetActions,
      timeFrameDuration: this.timeFrameDuration,
      timeFrameUnit: this.timeFrameUnit,
      presetDescription: this.presetDescription,
      presetInstructions: this.presetInstructions,
      presetModelId: this.presetModelId,
      presetProviderId: this.presetProviderId,
      presetTemperature: this.presetTemperature,
      sId: this.sId,
      tags: this.tags,
      visibility: this.visibility,
    };
  }
}
