import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import { makeUrlForEmojiAndBackground } from "@app/components/agent_builder/settings/avatar_picker/utils";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import {
  CROSS_WORKSPACE_RESOURCES_WORKSPACE_ID,
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources//string_ids";
import { BaseResource } from "@app/lib/resources/base_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { TemplateModel } from "@app/lib/resources/storage/models/templates";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelId, Result, TemplateVisibility } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

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

  get pictureUrl() {
    const [id, unified] = this.emoji ? this.emoji.split("/") : [];

    return makeUrlForEmojiAndBackground(
      {
        id,
        unified,
        native: "",
      },
      this.backgroundColor as `bg-${string}`
    );
  }

  get sId(): string {
    return TemplateResource.modelIdToSId({
      id: this.id,
    });
  }

  static async makeNew(blob: CreationAttributes<TemplateModel>) {
    const template = await TemplateModel.create({
      ...blob,
    });

    return new this(TemplateModel, template.get());
  }

  static async fetchByExternalId(
    sId: string
  ): Promise<TemplateResource | null> {
    const id = getResourceIdFromSId(sId);
    if (!id) {
      return null;
    }
    return this.fetchByModelId(id);
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

  static async upsertByHandle(
    blob: CreationAttributes<TemplateModel>,
    { keepIdMapping = false }: { keepIdMapping?: boolean } = {}
  ): Promise<Result<TemplateResource, Error>> {
    const existing = await TemplateModel.findOne({
      where: { handle: blob.handle },
    });

    if (!existing) {
      const template = await TemplateResource.makeNew(blob);
      return new Ok(template);
    }

    if (!keepIdMapping || existing.id === blob.id) {
      await existing.update(blob);
      return new Ok(new TemplateResource(TemplateModel, existing.get()));
    }

    // We need to keep the id mapping, mostly for workspace relocations.

    // 1. We abort if there is no template with a higher id than the one we want to create.
    // Since we don't bump the sequence, this prevents creating a template with an id that
    // could be taken by a future template.
    const templatesWithHigherId = await TemplateModel.findAll({
      where: {
        id: { [Op.gt]: blob.id },
      },
    });
    if (templatesWithHigherId.length === 0) {
      return new Err(new Error("No templates with higher id found, aborting."));
    }

    // 2. We abort if the id we want to create is already taken by another template.
    const templateWithSameId = await TemplateModel.findOne({
      where: { id: blob.id },
    });
    if (templateWithSameId) {
      return new Err(new Error("Template ID already taken, aborting."));
    }

    // 3. We create a new template and update the agents to use the new one.
    return frontSequelize.transaction(async (t) => {
      const templateCopy = await TemplateResource.makeNew(blob);
      await AgentConfiguration.update(
        {
          templateId: templateCopy.id,
        },
        {
          where: { templateId: existing.id },
          transaction: t,
        }
      );
      await existing.destroy({ transaction: t });

      return new Ok(templateCopy);
    });
  }

  static modelIdToSId({ id }: { id: ModelId }): string {
    return makeSId("template", {
      id,
      workspaceId: CROSS_WORKSPACE_RESOURCES_WORKSPACE_ID,
    });
  }

  static isTemplateSId(sId: string): boolean {
    return isResourceSId("template", sId);
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
      return new Err(normalizeError(err));
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

  toListJSON() {
    return {
      id: this.id,
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
