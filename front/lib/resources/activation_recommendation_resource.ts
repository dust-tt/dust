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
    > &
      Partial<
        Pick<
          CreationAttributes<ActivationRecommendationModel>,
          "activationPodId"
        >
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
      activationPodId: blob.activationPodId ?? null,
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

  // Detaches all recommendations from a Pod being deleted. Recommendations
  // are owned by the user, not the pod, so they are kept and only unlinked.
  static async detachActivationPod(
    auth: Authenticator,
    activationPodId: ModelId
  ): Promise<void> {
    await this.model.update(
      { activationPodId: null },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          activationPodId,
        },
      }
    );
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
