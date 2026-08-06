import type { Authenticator } from "@app/lib/auth";
import { ActivationNudgeModel } from "@app/lib/models/activation/activation_nudge";
import type { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ActivationNudgeResource
  extends ReadonlyAttributesType<ActivationNudgeModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ActivationNudgeResource extends BaseResource<ActivationNudgeModel> {
  static model: ModelStatic<ActivationNudgeModel> = ActivationNudgeModel;

  constructor(
    _: ModelStatic<ActivationNudgeModel>,
    blob: Attributes<ActivationNudgeModel>
  ) {
    super(ActivationNudgeModel, blob);
  }

  get sId(): string {
    return ActivationNudgeResource.modelIdToSId({
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
    return makeSId("activation_nudge", { id, workspaceId });
  }

  // Claims a nudge for a pod before posting it. The row is written first so a
  // retry of a crashed send is rejected by the frequency cap instead of
  // posting the nudge twice.
  static async makeNew(
    auth: Authenticator,
    {
      activationPod,
      pod,
    }: { activationPod: ActivationPodResource; pod: SpaceResource }
  ): Promise<ActivationNudgeResource> {
    const nudge = await this.model.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      status: "posting",
      spaceId: pod.id,
      triggerId: null,
      userId: activationPod.userId,
      activationPodId: activationPod.id,
    });

    return new this(this.model, nudge.get());
  }

  // Links the conversation the nudge is about to be posted into. Written before
  // the message itself, since posting it authorizes the nudge origin against
  // this link.
  async attachConversation(conversation: ConversationResource): Promise<void> {
    await this.update({ conversationId: conversation.id });
  }

  async markPosted(): Promise<void> {
    await this.update({ status: "posted" });
  }

  async markFailed(errorMessage: string): Promise<void> {
    await this.update({ status: "failed", errorMessage });
  }

  // The nudge that opened this conversation, if it is a nudge conversation.
  static async fetchByConversation(
    auth: Authenticator,
    conversation: ConversationResource
  ): Promise<ActivationNudgeResource | null> {
    const nudge = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversation.id,
      },
    });

    return nudge ? new this(this.model, nudge.get()) : null;
  }

  // Fetches the most recent nudge that reached the user (or is on its way), if
  // any. Nudges that failed to post are excluded: they gate nothing, so the
  // pod can be nudged again at its next slot.
  static async fetchLatestSentForActivationPod(
    auth: Authenticator,
    { activationPod }: { activationPod: ActivationPodResource }
  ): Promise<ActivationNudgeResource | null> {
    const [latest] = await this.listRecentSentForActivationPod(auth, {
      activationPod,
      limit: 1,
    });
    return latest ?? null;
  }

  // Fetches the `limit` most recent nudges that reached the user (or are on
  // their way), newest first.
  static async listRecentSentForActivationPod(
    auth: Authenticator,
    {
      activationPod,
      limit,
    }: { activationPod: ActivationPodResource; limit: number }
  ): Promise<ActivationNudgeResource[]> {
    const nudges = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        activationPodId: activationPod.id,
        status: ["posting", "posted"],
      },
      order: [["createdAt", "DESC"]],
      limit,
    });

    return nudges.map((nudge) => new this(this.model, nudge.get()));
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
      return new Err(normalizeError(err));
    }
  }
}
