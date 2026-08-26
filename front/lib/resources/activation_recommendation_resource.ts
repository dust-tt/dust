import type { Authenticator } from "@app/lib/auth";
import type { ActivationRecommendationStatus } from "@app/lib/models/activation/activation_recommendation";
import { ActivationRecommendationModel } from "@app/lib/models/activation/activation_recommendation";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import type { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
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
          | "activationPodId"
          | "body"
          | "steps"
          | "ctaLabel"
          | "sourceIcon"
          | "sourceLabel"
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
      body: blob.body ?? null,
      steps: blob.steps ?? null,
      ctaLabel: blob.ctaLabel ?? null,
      sourceIcon: blob.sourceIcon ?? null,
      sourceLabel: blob.sourceLabel ?? null,
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
    {
      limit = 100,
      activationPodModelId,
    }: { limit?: number; activationPodModelId?: number } = {}
  ): Promise<ActivationRecommendationResource[]> {
    const user = auth.getNonNullableUser();
    const recs = await this.model.findAll({
      where: {
        userId: user.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        ...(activationPodModelId
          ? { activationPodId: activationPodModelId }
          : {}),
      },
      order: [["createdAt", "DESC"]],
      limit,
    });

    return recs.map((rec) => new this(this.model, rec.get()));
  }

  static async listByWorkspace(
    auth: Authenticator,
    { limit = 100 }: { limit?: number } = {}
  ): Promise<ActivationRecommendationResource[]> {
    const recs = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      order: [["createdAt", "DESC"]],
      limit,
    });

    return recs.map((rec) => new this(this.model, rec.get()));
  }

  static async listByUserAndStatus(
    auth: Authenticator,
    {
      status,
      limit = 5,
      sinceDaysAgo,
      spaceModelId,
      activationPodModelId,
    }: {
      status: ActivationRecommendationStatus;
      limit?: number;
      sinceDaysAgo?: number;
      spaceModelId?: ModelId;
      activationPodModelId?: ModelId;
    }
  ): Promise<
    {
      resource: ActivationRecommendationResource;
      conversationSId: string | null;
    }[]
  > {
    const where: WhereOptions<ActivationRecommendationModel> = {
      workspaceId: auth.getNonNullableWorkspace().id,
      status,
      ...(activationPodModelId !== undefined
        ? { activationPodId: activationPodModelId }
        : { userId: auth.getNonNullableUser().id }),
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
          required: spaceModelId !== undefined,
          ...(spaceModelId !== undefined
            ? { where: { spaceId: spaceModelId } }
            : {}),
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

  // Deletes everything tied to a Pod's activation record before the record
  // itself is deleted: its recommendations, and its dedicated activation
  // trigger. The FK from activation_recommendations to activation_pods is
  // `onDelete: "RESTRICT"`, so the recommendations must go first or deleting
  // the activation pod record fails. The trigger only exists to nudge this
  // Pod's user, so — unlike other triggers scoped to the Pod's space, which
  // are merely detached and kept running elsewhere — it must be actually
  // deleted, not just unlinked.
  static async deleteAllForActivationPod(
    auth: Authenticator,
    activationPod: ActivationPodResource
  ): Promise<void> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        activationPodId: activationPod.id,
      },
    });
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<undefined> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
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
      body: this.body,
      steps: this.steps,
      ctaLabel: this.ctaLabel,
      sourceIcon: this.sourceIcon,
      sourceLabel: this.sourceLabel,
      createdAt: this.createdAt,
    };
  }
}
