import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationGoalModel } from "@app/lib/models/agent/conversation_goal";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ConversationBranchResource } from "@app/lib/resources/conversation_branch_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type { GoalStatus, GoalType } from "@app/types/assistant/goal";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import type { Attributes, Transaction } from "sequelize";

export class GoalTransitionError extends Error {
  constructor(
    readonly type:
      | "goal_not_found"
      | "goal_conflict"
      | "invalid_transition"
      | "wrong_agent"
  ) {
    super(type);
  }
}

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

  toJSON(): GoalType {
    return {
      sId: this.sId,
      objective: this.objective,
      status: this.status,
      agentConfigurationId: this.agentConfigurationId,
      branchId: this.branchId
        ? ConversationBranchResource.modelIdToSId({
            id: this.branchId,
            workspaceId: this.workspaceId,
          })
        : null,
      turnCount: this.turnCount,
      maxTurns: this.maxTurns,
      reason: this.reason,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      terminalAt: this.terminalAt?.getTime() ?? null,
    };
  }

  static async makeNew(
    auth: Authenticator,
    {
      objective,
      conversation,
      branchId,
      agentConfigurationId,
      currentAgentMessageId,
      maxTurns,
    }: {
      objective: string;
      conversation: ConversationResource;
      branchId: string | null;
      agentConfigurationId: string;
      currentAgentMessageId: string;
      maxTurns: number;
    },
    transaction: Transaction
  ): Promise<ConversationGoalResource> {
    const workspace = auth.getNonNullableWorkspace();
    let branchModelId: ModelId | null = null;
    if (branchId) {
      const branch = await ConversationBranchResource.fetchById(
        auth,
        branchId,
        transaction
      );
      if (
        !branch ||
        branch.conversationId !== conversation.id ||
        !branch.canWrite(auth)
      ) {
        throw new Error("Invalid conversation branch for goal.");
      }
      branchModelId = branch.id;
    }

    const message = await MessageModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        branchId: branchModelId,
        sId: currentAgentMessageId,
      },
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
          where: { agentConfigurationId },
        },
      ],
      transaction,
    });
    if (!message?.agentMessage) {
      throw new Error("Invalid agent message for conversation goal.");
    }

    const row = await this.model.create(
      {
        workspaceId: workspace.id,
        objective,
        conversationId: conversation.id,
        branchId: branchModelId,
        createdByUserId: auth.getNonNullableUser().id,
        agentConfigurationId,
        currentAgentMessageId: message.agentMessage.id,
        maxTurns,
        status: "active",
        turnCount: 1,
        lastAgentMessageId: null,
        reason: null,
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
      branchId = null,
    }: {
      conversation: ConversationResource;
      branchId?: string | null;
    }
  ): Promise<ConversationGoalResource | null> {
    const row = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversation.id,
        branchId: branchId ? getResourceIdFromSId(branchId) : null,
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

  static async fetchActiveForAgentLoop(
    auth: Authenticator,
    agentLoopData: AgentLoopExecutionData
  ): Promise<ConversationGoalResource | null> {
    const row = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: agentLoopData.conversation.id,
        branchId: agentLoopData.conversation.branchId
          ? getResourceIdFromSId(agentLoopData.conversation.branchId)
          : null,
        status: "active",
        agentConfigurationId: agentLoopData.agentConfiguration.sId,
        currentAgentMessageId: agentLoopData.agentMessage.agentMessageId,
      },
    });
    if (!row || row.lastAgentMessageId === row.currentAgentMessageId) {
      return null;
    }
    return new this(this.model, row.get());
  }

  static async updateFromAgent(
    auth: Authenticator,
    {
      agentLoopData,
      status,
      reason,
    }: {
      agentLoopData: AgentLoopExecutionData;
      status: "complete" | "blocked";
      reason?: string;
    }
  ): Promise<Result<ConversationGoalResource, GoalTransitionError>> {
    return withTransaction(async (transaction) => {
      const row = await this.model.findOne({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: agentLoopData.conversation.id,
          branchId: agentLoopData.conversation.branchId
            ? getResourceIdFromSId(agentLoopData.conversation.branchId)
            : null,
        },
        order: [
          ["createdAt", "DESC"],
          ["id", "DESC"],
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) {
        return new Err(new GoalTransitionError("goal_not_found"));
      }

      const goal = new this(this.model, row.get());
      const targetStatus: GoalStatus =
        status === "complete" ? "completed" : "blocked";
      if (
        goal.agentConfigurationId !== agentLoopData.agentConfiguration.sId ||
        goal.currentAgentMessageId !==
          agentLoopData.agentMessage.agentMessageId ||
        goal.lastAgentMessageId === goal.currentAgentMessageId
      ) {
        return new Err(new GoalTransitionError("wrong_agent"));
      }
      if (goal.status === targetStatus) {
        return new Ok(goal);
      }
      if (goal.status !== "active") {
        return new Err(new GoalTransitionError("invalid_transition"));
      }

      const [, rows] = await this.model.update(
        {
          status: targetStatus,
          reason: reason ?? null,
          terminalAt: new Date(),
        },
        {
          where: { id: goal.id, workspaceId: goal.workspaceId },
          returning: true,
          transaction,
        }
      );
      const updated = rows[0];
      return updated
        ? new Ok(new this(this.model, updated.get()))
        : new Err(new GoalTransitionError("goal_conflict"));
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
