import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import {
  ConversationGoalModel,
  UNFINISHED_GOAL_STATUSES,
} from "@app/lib/models/agent/conversation_goal";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ConversationBranchResource } from "@app/lib/resources/conversation_branch_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  AgentLoopArgs,
  AgentLoopExecutionData,
} from "@app/types/assistant/agent_run";
import type { GoalStatus, GoalType } from "@app/types/assistant/goal";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

export const DEFAULT_GOAL_MAX_TURNS = 25;

export type GoalContinuationDecision =
  | { type: "continue" | "ensure_current"; goal: GoalType }
  | {
      type:
        | "already_processed"
        | "inactive"
        | "newer_message"
        | "not_succeeded"
        | "turn_limit_reached";
    };

export type GoalTurnRecovery =
  | { type: "already_succeeded" }
  | { type: "restart"; agentLoopArgs: AgentLoopArgs }
  | { type: "unavailable" };

export class GoalTransitionError extends Error {
  constructor(
    readonly type:
      | "goal_not_found"
      | "goal_conflict"
      | "forbidden"
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
      branchId = null,
      agentConfigurationId,
      currentAgentMessageId,
      maxTurns,
    }: {
      objective: string;
      conversation: ConversationResource;
      branchId?: string | null;
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

  static async fetchUnfinished(
    auth: Authenticator,
    {
      conversationModelId,
      branchId,
      transaction,
    }: {
      conversationModelId: ModelId;
      branchId: string | null;
      transaction?: Transaction;
    }
  ): Promise<ConversationGoalResource | null> {
    const row = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversationModelId,
        branchId: branchId ? getResourceIdFromSId(branchId) : null,
        status: { [Op.in]: UNFINISHED_GOAL_STATUSES },
      },
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
      transaction,
    });
    return row ? new this(this.model, row.get()) : null;
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
        goal.agentConfigurationId !==
          agentLoopData.agentMessage.configuration.sId ||
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
          where: {
            id: goal.id,
            workspaceId: goal.workspaceId,
            status: "active",
          },
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

  static async claimContinuation(
    auth: Authenticator,
    {
      conversationId,
      conversationBranchId,
      agentMessageId,
    }: {
      conversationId: string;
      conversationBranchId: string | null;
      agentMessageId: string;
    }
  ): Promise<GoalContinuationDecision> {
    const conversation = await ConversationModel.findOne({
      attributes: ["id"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sId: conversationId,
      },
    });
    if (!conversation) {
      return { type: "inactive" };
    }

    return withTransaction(async (transaction) => {
      const goalRow = await this.model.findOne({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: conversation.id,
          branchId: conversationBranchId
            ? getResourceIdFromSId(conversationBranchId)
            : null,
        },
        order: [
          ["createdAt", "DESC"],
          ["id", "DESC"],
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!goalRow || goalRow.status !== "active") {
        return { type: "inactive" };
      }

      const message = await MessageModel.findOne({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: conversation.id,
          sId: agentMessageId,
          branchId: conversationBranchId
            ? getResourceIdFromSId(conversationBranchId)
            : null,
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
      if (message?.agentMessage?.status !== "succeeded") {
        return { type: "not_succeeded" };
      }
      if (goalRow.lastAgentMessageId === message.agentMessage.id) {
        if (goalRow.currentAgentMessageId === message.agentMessage.id) {
          return {
            type: "continue",
            goal: new this(this.model, goalRow.get()).toJSON(),
          };
        }
        return {
          type: "ensure_current",
          goal: new this(this.model, goalRow.get()).toJSON(),
        };
      }
      if (
        goalRow.currentAgentMessageId !== message.agentMessage.id ||
        goalRow.agentConfigurationId !==
          message.agentMessage.agentConfigurationId
      ) {
        return { type: "inactive" };
      }

      const newerMessage = await MessageModel.findOne({
        attributes: ["id"],
        where: {
          workspaceId: goalRow.workspaceId,
          conversationId: goalRow.conversationId,
          branchId: conversationBranchId
            ? getResourceIdFromSId(conversationBranchId)
            : null,
          rank: { [Op.gt]: message.rank },
          visibility: { [Op.not]: "deleted" },
        },
        transaction,
      });
      if (newerMessage) {
        await goalRow.update(
          {
            status: "paused",
            reason: "user_interrupted",
            lastAgentMessageId: message.agentMessage.id,
          },
          { transaction }
        );
        return { type: "newer_message" };
      }

      if (goalRow.turnCount >= goalRow.maxTurns) {
        await goalRow.update(
          {
            status: "paused",
            reason: "turn_limit_reached",
            lastAgentMessageId: message.agentMessage.id,
          },
          { transaction }
        );
        return { type: "turn_limit_reached" };
      }

      await goalRow.update(
        {
          lastAgentMessageId: message.agentMessage.id,
          turnCount: goalRow.turnCount + 1,
        },
        { transaction }
      );
      return {
        type: "continue",
        goal: new this(this.model, goalRow.get()).toJSON(),
      };
    });
  }

  static async pauseActiveForUserMessage(
    auth: Authenticator,
    {
      conversation,
      branchId,
      transaction,
    }: {
      conversation: ConversationResource;
      branchId: string | null;
      transaction: Transaction;
    }
  ): Promise<boolean> {
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
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!row || row.status !== "active") {
      return false;
    }
    await row.update(
      { status: "paused", reason: "user_interrupted" },
      { transaction }
    );
    return true;
  }

  async lockForContinuation(
    auth: Authenticator,
    {
      conversation,
      branchId,
      transaction,
    }: {
      conversation: ConversationResource;
      branchId: string | null;
      transaction: Transaction;
    }
  ): Promise<boolean> {
    const branchModelId = branchId ? getResourceIdFromSId(branchId) : null;
    if (branchId && !branchModelId) {
      return false;
    }
    const row = await this.model.findOne({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversation.id,
        branchId: branchModelId,
        currentAgentMessageId: this.currentAgentMessageId,
        lastAgentMessageId: this.currentAgentMessageId,
        status: "active",
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    return row !== null;
  }

  static async pauseForAgentMessage(
    auth: Authenticator,
    {
      conversationId,
      conversationBranchId,
      agentMessageId,
      reason,
    }: {
      conversationId: string;
      conversationBranchId: string | null;
      agentMessageId: string;
      reason: string;
    }
  ): Promise<boolean> {
    const conversation = await ConversationModel.findOne({
      attributes: ["id"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sId: conversationId,
      },
    });
    if (!conversation) {
      return false;
    }

    return withTransaction(async (transaction) => {
      const goal = await this.model.findOne({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: conversation.id,
          branchId: conversationBranchId
            ? getResourceIdFromSId(conversationBranchId)
            : null,
          status: "active",
        },
        order: [
          ["createdAt", "DESC"],
          ["id", "DESC"],
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!goal) {
        return false;
      }

      const message = await MessageModel.findOne({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: conversation.id,
          sId: agentMessageId,
          branchId: conversationBranchId
            ? getResourceIdFromSId(conversationBranchId)
            : null,
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
      if (
        !message?.agentMessage ||
        goal.currentAgentMessageId !== message.agentMessage.id
      ) {
        return false;
      }
      await goal.update({ status: "paused", reason }, { transaction });
      return true;
    });
  }

  static async pauseByUser(
    auth: Authenticator,
    {
      conversation,
      branchId,
    }: {
      conversation: ConversationResource;
      branchId: string | null;
    }
  ): Promise<Result<ConversationGoalResource, GoalTransitionError>> {
    return withTransaction(async (transaction) => {
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
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) {
        return new Err(new GoalTransitionError("goal_not_found"));
      }

      const goal = new this(this.model, row.get());
      if (goal.createdByUserId !== auth.getNonNullableUser().id) {
        return new Err(new GoalTransitionError("forbidden"));
      }

      if (goal.status === "paused") {
        return new Ok(goal);
      }
      if (goal.status !== "active") {
        return new Err(new GoalTransitionError("invalid_transition"));
      }

      const [, rows] = await this.model.update(
        {
          status: "paused",
          reason: "paused_by_user",
        },
        {
          where: {
            id: goal.id,
            workspaceId: goal.workspaceId,
            status: goal.status,
          },
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

  async failCurrentTurn(
    auth: Authenticator,
    {
      conversation,
      reason,
    }: {
      conversation: ConversationResource;
      reason: string;
    }
  ): Promise<boolean> {
    return withTransaction(async (transaction) => {
      const goal = await this.model.findOne({
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: conversation.id,
          branchId: this.branchId,
          currentAgentMessageId: this.currentAgentMessageId,
          status: "active",
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!goal) {
        return false;
      }
      await AgentMessageModel.update(
        { status: "failed", completedAt: new Date() },
        {
          where: {
            id: goal.currentAgentMessageId,
            workspaceId: goal.workspaceId,
            status: "created",
          },
          transaction,
        }
      );
      await goal.update({ status: "paused", reason }, { transaction });
      return true;
    });
  }

  async fetchTurnRecovery(
    auth: Authenticator,
    {
      conversation,
    }: {
      conversation: ConversationResource;
    }
  ): Promise<GoalTurnRecovery> {
    if (
      this.workspaceId !== auth.getNonNullableWorkspace().id ||
      this.conversationId !== conversation.id ||
      this.status !== "active"
    ) {
      return { type: "unavailable" };
    }
    const agentMessage = await MessageModel.findOne({
      where: {
        workspaceId: this.workspaceId,
        conversationId: conversation.id,
        branchId: this.branchId,
        agentMessageId: this.currentAgentMessageId,
      },
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
          where: { agentConfigurationId: this.agentConfigurationId },
        },
      ],
    });
    if (agentMessage?.agentMessage?.status === "succeeded") {
      return { type: "already_succeeded" };
    }
    if (
      agentMessage?.agentMessage?.status !== "created" ||
      !agentMessage.parentId
    ) {
      return { type: "unavailable" };
    }
    const userMessage = await MessageModel.findOne({
      where: {
        id: agentMessage.parentId,
        workspaceId: this.workspaceId,
        conversationId: conversation.id,
        branchId: this.branchId,
      },
      include: [
        {
          model: UserMessageModel,
          as: "userMessage",
          required: true,
        },
      ],
    });
    if (!userMessage?.userMessage) {
      return { type: "unavailable" };
    }
    return {
      type: "restart",
      agentLoopArgs: {
        agentMessageId: agentMessage.sId,
        agentMessageVersion: agentMessage.version,
        conversationId: conversation.sId,
        conversationBranchId: this.toJSON().branchId,
        conversationTitle: conversation.title,
        userMessageId: userMessage.sId,
        userMessageVersion: userMessage.version,
        userMessageOrigin: userMessage.userMessage.userContextOrigin,
      },
    };
  }

  async setCurrentAgentMessage(
    auth: Authenticator,
    {
      conversation,
      branchId,
      agentMessageId,
      agentConfigurationId,
      transaction,
    }: {
      conversation: ConversationResource;
      branchId: string | null;
      agentMessageId: string;
      agentConfigurationId: string;
      transaction: Transaction;
    }
  ): Promise<boolean> {
    const branchModelId = branchId ? getResourceIdFromSId(branchId) : null;
    if (branchId && !branchModelId) {
      return false;
    }
    const message = await MessageModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversation.id,
        branchId: branchModelId,
        sId: agentMessageId,
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
      return false;
    }
    const [updated] = await this.model.update(
      { currentAgentMessageId: message.agentMessage.id },
      {
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: conversation.id,
          branchId: branchModelId,
          agentConfigurationId,
          currentAgentMessageId: this.currentAgentMessageId,
          lastAgentMessageId: this.currentAgentMessageId,
          status: "active",
        },
        transaction,
      }
    );
    return updated === 1;
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
