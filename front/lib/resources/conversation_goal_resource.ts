import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationGoalModel } from "@app/lib/models/agent/conversation_goal";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok, type Result } from "@app/types/shared/result";
import type { Attributes, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ConversationGoalResource
  extends ReadonlyAttributesType<ConversationGoalModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConversationGoalResource extends BaseResource<ConversationGoalModel> {
  static model: ModelStaticWorkspaceAware<ConversationGoalModel> =
    ConversationGoalModel;

  constructor(
    model: ModelStaticWorkspaceAware<ConversationGoalModel>,
    blob: Attributes<ConversationGoalModel>
  ) {
    super(model, blob);
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("conversation_goal", { id, workspaceId });
  }

  get sId(): string {
    return ConversationGoalResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static async makeNew(
    auth: Authenticator,
    {
      objective,
      conversation,
      currentAgentMessageId,
    }: {
      objective: string;
      conversation: ConversationResource;
      currentAgentMessageId: string;
    },
    transaction: Transaction
  ): Promise<ConversationGoalResource> {
    const workspace = auth.getNonNullableWorkspace();
    const message = await MessageModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        branchId: null,
        sId: currentAgentMessageId,
      },
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
        },
      ],
      transaction,
    });
    if (!message?.agentMessage) {
      throw new Error("Invalid root agent message for conversation goal.");
    }

    const row = await this.model.create(
      {
        workspaceId: workspace.id,
        objective,
        conversationId: conversation.id,
        branchId: null,
        createdByUserId: auth.getNonNullableUser().id,
        currentAgentMessageId: message.agentMessage.id,
        status: "active",
        lastAgentMessageId: null,
        statusReason: null,
        terminalAt: null,
      },
      { transaction }
    );
    return new this(this.model, row.get());
  }

  static async fetchLatest(
    auth: Authenticator,
    {
      conversation,
    }: {
      conversation: ConversationResource;
    }
  ): Promise<ConversationGoalResource | null> {
    const row = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversation.id,
        branchId: null,
      },
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
    });
    return row ? new this(this.model, row.get()) : null;
  }

  static async deleteForConversation(
    auth: Authenticator,
    conversationModelId: ModelId
  ): Promise<void> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversationModelId,
      },
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
    return new Ok(undefined);
  }
}
