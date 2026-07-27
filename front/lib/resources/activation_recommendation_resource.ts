import type { Authenticator } from "@app/lib/auth";
import {
  ActivationRecommendationModel,
  type ActivationRecommendationStatus,
} from "@app/lib/models/activation/activation_recommendation";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ActivationRecommendationResource
  extends ReadonlyAttributesType<ActivationRecommendationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ActivationRecommendationResource extends BaseResource<ActivationRecommendationModel> {
  static model: ModelStatic<ActivationRecommendationModel> =
    ActivationRecommendationModel;

  constructor(
    _: ModelStatic<ActivationRecommendationModel>,
    blob: Attributes<ActivationRecommendationModel>
  ) {
    super(ActivationRecommendationModel, blob);
  }

  get sId(): string {
    return ActivationRecommendationResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("activation_recommendation", { id, workspaceId });
  }

  static async makeNew(
    auth: Authenticator,
    blob: Pick<
      CreationAttributes<ActivationRecommendationModel>,
      "title" | "content" | "conversationId"
    >
  ): Promise<ActivationRecommendationResource> {
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const rec = await this.model.create({
      workspaceId: workspace.id,
      userId: user.id,
      status: "suggested",
      title: blob.title,
      content: blob.content,
      conversationId: blob.conversationId ?? null,
    });

    return new this(this.model, rec.get());
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<ActivationRecommendationResource | null> {
    const resourceId = getResourceIdFromSId(sId);
    if (!resourceId) {
      return null;
    }

    const rec = await this.model.findOne({
      where: {
        id: resourceId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    if (!rec) {
      return null;
    }

    return new this(this.model, rec.get());
  }

  // Fetches the recommendation records surfaced in a given conversation.
  // Used to feed the actual recommendation card content into downstream
  // generation (e.g. the activation email summary), rather than relying only
  // on the rendered conversation messages.
  static async fetchByConversationSId(
    auth: Authenticator,
    conversationSId: string
  ): Promise<ActivationRecommendationResource[]> {
    const recs = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      include: [
        {
          model: ConversationModel,
          attributes: [],
          required: true,
          where: { sId: conversationSId },
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return recs.map((rec) => new this(this.model, rec.get()));
  }

  static async fetchByUser(
    auth: Authenticator,
    { limit = 100 }: { limit?: number } = {}
  ): Promise<ActivationRecommendationResource[]> {
    const user = auth.getNonNullableUser();
    const recs = await this.model.findAll({
      where: {
        userId: user.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      order: [["createdAt", "DESC"]],
      limit,
    });

    return recs.map((rec) => new this(this.model, rec.get()));
  }

  static async listSuggestedByUser(
    auth: Authenticator,
    { limit = 5, sinceDaysAgo }: { limit?: number; sinceDaysAgo?: number } = {}
  ): Promise<
    {
      resource: ActivationRecommendationResource;
      conversationSId: string | null;
    }[]
  > {
    const user = auth.getNonNullableUser();

    const where: WhereOptions<ActivationRecommendationModel> = {
      userId: user.id,
      workspaceId: auth.getNonNullableWorkspace().id,
      status: "suggested",
    };

    if (sinceDaysAgo !== undefined) {
      const sinceMs = Date.now() - sinceDaysAgo * 24 * 60 * 60 * 1000;
      where.createdAt = { [Op.gte]: new Date(sinceMs) };
    }

    const recs = await this.model.findAll({
      where,
      include: [
        {
          model: ConversationModel,
          attributes: ["sId"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
    });

    return recs.map((rec) => ({
      resource: new this(this.model, rec.get()),
      conversationSId: rec.conversation?.sId ?? null,
    }));
  }

  async updateFields(fields: {
    status?: Exclude<ActivationRecommendationStatus, "suggested">;
    createdSkillModelId?: ModelId;
    createdTriggerModelId?: ModelId;
  }): Promise<Result<undefined, Error>> {
    const patch: Partial<Attributes<ActivationRecommendationModel>> = {};
    if (fields.status !== undefined) {
      patch.status = fields.status;
    }
    if (fields.createdSkillModelId !== undefined) {
      patch.createdSkillId = fields.createdSkillModelId;
    }
    if (fields.createdTriggerModelId !== undefined) {
      patch.createdTriggerId = fields.createdTriggerModelId;
    }
    if (Object.keys(patch).length === 0) {
      return new Ok(undefined);
    }
    await this.update(patch);
    return new Ok(undefined);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(err instanceof Error ? err : new Error(String(err)));
    }
  }

  toJSON() {
    return {
      sId: this.sId,
      status: this.status,
      title: this.title,
      content: this.content,
      createdAt: this.createdAt,
    };
  }
}
