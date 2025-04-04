import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import type { PaginationParams } from "@app/lib/api/pagination";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import {
  AgentMessage,
  AgentMessage as AgentMessageModel,
  AgentMessageFeedback,
  ConversationModel,
  Message,
} from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  ConversationWithoutContentType,
  LightAgentConfigurationType,
  MessageType,
  Result,
  UserType,
  WorkspaceType,
} from "@app/types";
import { Err, GLOBAL_AGENTS_SID, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AgentMessageFeedbackResource
  extends ReadonlyAttributesType<AgentMessageFeedback> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentMessageFeedbackResource extends BaseResource<AgentMessageFeedback> {
  static model: ModelStatic<AgentMessageFeedback> = AgentMessageFeedback;

  readonly message?: Attributes<Message>;
  readonly user?: Attributes<UserModel>;
  readonly conversationId?: string;

  constructor(
    model: ModelStatic<AgentMessageFeedback>,
    blob: Attributes<AgentMessageFeedback>,
    {
      message,
      user,
      conversationId,
    }: {
      message?: Attributes<Message>;
      user?: Attributes<UserModel>;
      conversationId?: string;
    } = {}
  ) {
    super(AgentMessageFeedback, blob);

    this.message = message;
    this.user = user;
    this.conversationId = conversationId;
  }

  static async makeNew(
    blob: CreationAttributes<AgentMessageFeedback>,
    {
      message,
      user,
      conversationId,
    }: {
      message?: Attributes<Message>;
      user?: Attributes<UserModel>;
      conversationId?: string;
    } = {}
  ): Promise<AgentMessageFeedbackResource> {
    const agentMessageFeedback = await AgentMessageFeedback.create({
      ...blob,
    });

    return new AgentMessageFeedbackResource(
      AgentMessageFeedback,
      agentMessageFeedback.get(),
      { message, user, conversationId }
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
      },
      transaction,
    });
    return new Ok(undefined);
  }

  async updateFields(
    blob: Partial<
      Pick<
        AgentMessageFeedback,
        "content" | "thumbDirection" | "isConversationShared"
      >
    >
  ) {
    return this.update({
      content: blob.content,
      thumbDirection: blob.thumbDirection,
      isConversationShared: blob.isConversationShared,
    });
  }

  static async getAgentConfigurationFeedbacksByDescVersion({
    workspace,
    agentConfiguration,
    paginationParams,
  }: {
    workspace: WorkspaceType;
    agentConfiguration: LightAgentConfigurationType;
    paginationParams: PaginationParams;
  }) {
    const where: WhereOptions<AgentMessageFeedback> = {
      // Safety check: global models share ids across workspaces and some have had feedbacks.
      workspaceId: workspace.id,
      agentConfigurationId: agentConfiguration.sId,
    };

    if (paginationParams.lastValue) {
      const op = paginationParams.orderDirection === "desc" ? Op.lt : Op.gt;
      where[paginationParams.orderColumn as any] = {
        [op]: paginationParams.lastValue,
      };
    }

    const agentMessageFeedback = await AgentMessageFeedback.findAll({
      where,
      include: [
        {
          model: AgentMessageModel,
          attributes: ["id"],
          as: "agentMessage",
          include: [
            {
              model: Message,
              as: "message",
              attributes: ["id", "sId"],
              include: [
                {
                  model: ConversationModel,
                  as: "conversation",
                  attributes: ["id", "sId"],
                },
              ],
            },
          ],
        },
        {
          model: UserResource.model,
          as: "user",
          attributes: ["name", "imageUrl", "email"],
        },
      ],
      order: [
        // Necessary because a feedback can be given at any time on a  message linked to an old version.
        ["agentConfigurationVersion", "DESC"],
        [
          paginationParams.orderColumn,
          paginationParams.orderDirection === "desc" ? "DESC" : "ASC",
        ],
      ],
      limit: paginationParams.limit,
    });

    return agentMessageFeedback.map((feedback) => {
      return new AgentMessageFeedbackResource(
        AgentMessageFeedback,
        feedback.get(),
        {
          message: feedback.agentMessage?.message,
          user: feedback.user,
          conversationId: feedback.agentMessage?.message?.conversation?.sId,
        }
      );
    });
  }

  static async getFeedbackUsageDataForWorkspace({
    startDate,
    endDate,
    workspace,
  }: {
    startDate: Date;
    endDate: Date;
    workspace: WorkspaceType;
  }) {
    const agentMessageFeedback = await AgentMessageFeedback.findAll({
      where: {
        // IMPORTANT: Necessary for global models who share ids across workspaces.
        workspaceId: workspace.id,
        createdAt: {
          [Op.and]: [{ [Op.lt]: endDate }, { [Op.gt]: startDate }],
        },
      },

      include: [
        {
          model: AgentMessageModel,
          attributes: ["id"],
          as: "agentMessage",
        },
        {
          model: UserResource.model,
          as: "user",
          attributes: ["name", "email"],
        },
      ],
      order: [["id", "ASC"]],
    });

    return agentMessageFeedback
      .filter((feedback) => Boolean(feedback.user))
      .map((feedback) => {
        return new AgentMessageFeedbackResource(
          AgentMessageFeedback,
          feedback.get(),
          {
            user: feedback.user,
          }
        );
      });
  }

  static async getFeedbackCountForAssistants(
    auth: Authenticator,
    agentConfigurationIds: string[],
    daysOld?: number
  ) {
    const dateMinusXDays = new Date();
    if (daysOld) {
      dateMinusXDays.setDate(dateMinusXDays.getDate() - daysOld);
    }
    const workspace = auth.getNonNullableWorkspace();
    const feedbackCount = await AgentMessageFeedback.findAndCountAll({
      attributes: ["agentConfigurationId", "thumbDirection"],
      where: {
        workspaceId: workspace.id,
        agentConfigurationId: agentConfigurationIds,
        ...(daysOld ? { createdAt: { [Op.gt]: dateMinusXDays } } : {}),
      },
      group: ["agentConfigurationId", "thumbDirection"],
    });

    return feedbackCount.count as {
      thumbDirection: AgentMessageFeedbackDirection;
      agentConfigurationId: string;
      count: number;
    }[];
  }

  static async getConversationFeedbacksForUser(
    auth: Authenticator,
    conversation: ConversationType | ConversationWithoutContentType
  ) {
    const user = auth.getNonNullableUser();

    const feedbackForMessages = await Message.findAll({
      where: {
        conversationId: conversation.id,
        agentMessageId: {
          [Op.ne]: null,
        },
      },
      attributes: ["id", "sId", "agentMessageId"],
      include: [
        {
          model: AgentMessage,
          as: "agentMessage",
          attributes: ["id"],
          include: [
            {
              model: AgentMessageFeedbackResource.model,
              as: "feedbacks",
              where: {
                userId: user.id,
              },
            },
          ],
        },
      ],
    });
    const feedbacks = feedbackForMessages
      .filter(
        (
          message
        ): message is Message & {
          agentMessage: { feedbacks: AgentMessageFeedback[] };
        } =>
          !!message.agentMessage?.feedbacks &&
          message.agentMessage.feedbacks.length > 0
      )
      .map((message) => {
        const feedback = message.agentMessage?.feedbacks?.[0];
        return new AgentMessageFeedbackResource(
          AgentMessageFeedback,
          feedback.get(),
          {
            message,
          }
        );
      });
    return feedbacks;
  }

  static async getFeedbackWithConversationContext({
    auth,
    messageId,
    conversation,
    user,
  }: {
    auth: Authenticator;
    messageId: string;
    conversation: ConversationType | ConversationWithoutContentType;
    user: UserType;
  }): Promise<
    Result<
      {
        message: Pick<MessageType, "id" | "sId">;
        agentMessage: Pick<AgentMessageType, "id"> & {
          agentConfigurationId: string;
          agentConfigurationVersion: number;
        };
        feedback: AgentMessageFeedbackResource | null;
        agentConfiguration: Pick<
          AgentConfigurationType,
          "id" | "sId" | "version"
        >;
        isGlobalAgent: boolean;
      },
      Error
    >
  > {
    const message = await Message.findOne({
      attributes: ["id", "sId"],
      where: {
        sId: messageId,
        conversationId: conversation.id,
      },
      include: [
        {
          model: AgentMessage,
          as: "agentMessage",
          attributes: [
            "id",
            "agentConfigurationId",
            "agentConfigurationVersion",
          ],
        },
      ],
    });

    if (!message || !message.agentMessage) {
      return new Err(
        new Error("Message not found or not associated with an agent message")
      );
    }

    if (!message.agentMessage) {
      return new Err(new Error("Agent message not found"));
    }

    const agentMessageFeedback = await AgentMessageFeedback.findOne({
      where: {
        userId: user.id,
        agentMessageId: message.agentMessage.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
    const agentMessageFeedbackResource = agentMessageFeedback
      ? new AgentMessageFeedbackResource(
          AgentMessageFeedback,
          agentMessageFeedback.get()
        )
      : null;

    const isGlobalAgent = Object.values(GLOBAL_AGENTS_SID).includes(
      message.agentMessage.agentConfigurationId as GLOBAL_AGENTS_SID
    );

    if (isGlobalAgent) {
      return new Ok({
        message: {
          id: message.id,
          sId: message.sId,
        },
        agentMessage: {
          id: message.agentMessage.id,
          agentConfigurationId: message.agentMessage.agentConfigurationId,
          agentConfigurationVersion:
            message.agentMessage.agentConfigurationVersion,
        },
        feedback: agentMessageFeedbackResource,
        agentConfiguration: {
          id: -1,
          sId: message.agentMessage.agentConfigurationId,
          version: message.agentMessage.agentConfigurationVersion,
        },
        isGlobalAgent: true,
      });
    }

    const agentConfiguration = await AgentConfiguration.findOne({
      where: {
        sId: message.agentMessage.agentConfigurationId,
      },
      attributes: ["id", "sId", "version"],
    });

    if (!agentConfiguration) {
      return new Err(new Error("Agent configuration not found"));
    }

    return new Ok({
      message: {
        id: message.id,
        sId: message.sId,
      },
      agentMessage: {
        id: message.agentMessage.id,
        agentConfigurationId: message.agentMessage.agentConfigurationId,
        agentConfigurationVersion:
          message.agentMessage.agentConfigurationVersion,
      },
      feedback: agentMessageFeedbackResource,
      agentConfiguration: {
        id: agentConfiguration.id,
        sId: agentConfiguration.sId,
        version: agentConfiguration.version,
      },
      isGlobalAgent,
    });
  }

  toJSON() {
    return {
      id: this.id,
      messageId: this.message?.sId,
      agentMessageId: this.agentMessageId,
      userId: this.userId,
      thumbDirection: this.thumbDirection,
      content: this.content ? this.content.replace(/\r?\n/g, "\\n") : null,
      isConversationShared: this.isConversationShared,
      createdAt: this.createdAt,
      agentConfigurationId: this.agentConfigurationId,
      agentConfigurationVersion: this.agentConfigurationVersion,
      conversationId: this.conversationId,
      ...(this.user
        ? {
            userName: this.user.name,
            userEmail: this.user.email,
            userImageUrl: this.user.imageUrl,
          }
        : {}),
    };
  }
}
