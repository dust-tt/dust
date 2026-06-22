import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ConversationPlanModel } from "@app/lib/resources/storage/models/conversation_plan";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ConversationPlanResource
  extends ReadonlyAttributesType<ConversationPlanModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConversationPlanResource extends BaseResource<ConversationPlanModel> {
  static model: ModelStaticWorkspaceAware<ConversationPlanModel> =
    ConversationPlanModel;

  get sId(): string {
    return ConversationPlanResource.modelIdToSId({
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
    return makeSId("conversation_plan", { id, workspaceId });
  }

  static async makeNew(
    auth: Authenticator,
    { conversation }: { conversation: ConversationWithoutContentType }
  ): Promise<ConversationPlanResource> {
    const row = await this.model.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      conversationId: conversation.id,
      version: 1,
      isClosed: false,
      approvedAt: null,
      approvedByUserId: null,
      approvedVersion: null,
    });

    return new this(this.model, row.get());
  }

  static async fetchActiveForConversation(
    auth: Authenticator,
    conversation: ConversationWithoutContentType
  ): Promise<ConversationPlanResource | null> {
    const row = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversation.id,
        isClosed: false,
      },
    });

    return row ? new this(this.model, row.get()) : null;
  }

  async incrementVersion(): Promise<void> {
    await this.update({ version: this.version + 1 });
  }

  async recordApproval({
    approvedByUserId,
  }: {
    approvedByUserId: string;
  }): Promise<void> {
    await this.update({
      approvedAt: new Date(),
      approvedByUserId,
      approvedVersion: this.version,
    });
  }

  async markClosed(): Promise<void> {
    await this.update({ isClosed: true });
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

  // FK is RESTRICT, so the conversation destroy path must delete plans before the conversation row
  // (mirrors WakeUp/Sandbox).
  static async deleteByConversation(
    auth: Authenticator,
    conversation: ConversationWithoutContentType,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversation.id,
      },
      transaction,
    });
  }
}
