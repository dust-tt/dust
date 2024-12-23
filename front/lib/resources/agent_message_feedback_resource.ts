import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationError,
  ConversationType,
  ConversationWithoutContentType,
  MessageType,
  Result,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { GLOBAL_AGENTS_SID } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic } from "sequelize";
import type { CreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";

import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import {
  AgentMessage as AgentMessageModel,
  AgentMessageFeedback,
  Conversation,
  Message,
} from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { UserResource } from "@app/lib/resources/user_resource";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AgentMessageFeedbackResource
  extends ReadonlyAttributesType<AgentMessageFeedback> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentMessageFeedbackResource extends BaseResource<AgentMessageFeedback> {
  static model: ModelStatic<AgentMessageFeedback> = AgentMessageFeedback;

  constructor(
    model: ModelStatic<AgentMessageFeedback>,
    blob: Attributes<AgentMessageFeedback>
  ) {
    super(AgentMessageFeedback, blob);
  }

  static async makeNew(
    blob: CreationAttributes<AgentMessageFeedback>
  ): Promise<AgentMessageFeedbackResource> {
    const agentMessageFeedback = await AgentMessageFeedback.create({
      ...blob,
    });

    return new AgentMessageFeedbackResource(
      AgentMessageFeedback,
      agentMessageFeedback.get()
    );
  }

  static async fetchByUserAndAgentMessage({
    auth,
    user,
    agentMessage,
  }: {
    auth: Authenticator;
    user: UserType;
    agentMessage: AgentMessage;
  }): Promise<AgentMessageFeedbackResource | null> {
    const agentMessageFeedback = await AgentMessageFeedback.findOne({
      where: {
        userId: user.id,
        agentMessageId: agentMessage.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    if (!agentMessageFeedback) {
      return null;
    }

    return new AgentMessageFeedbackResource(
      AgentMessageFeedback,
      agentMessageFeedback.get()
    );
  }

  async updateFields(
    blob: Partial<
      Pick<
        AgentMessageFeedback,
        "content" | "thumbDirection" | "isConversationShared"
      >
    >
  ) {
    return this.update(blob);
  }

  static async fetchByAgentConfigurationId({
    auth,
    agentConfigurationId,
    pagination,
  }: {
    auth: Authenticator;
    agentConfigurationId: string;
    pagination: {
      limit: number;
      olderThan?: Date;
    };
  }): Promise<AgentMessageFeedback[]> {
    const agentMessageFeedback = await AgentMessageFeedback.findAll({
      where: {
        agentConfigurationId,
        // Necessary for global models who share ids across workspaces
        workspaceId: auth.getNonNullableWorkspace().id,
        ...(pagination.olderThan && {
          createdAt: {
            [Op.lt]: pagination.olderThan,
          },
        }),
      },

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
                  model: Conversation,
                  as: "conversation",
                },
              ],
            },
          ],
        },
        {
          model: UserResource.model,
          attributes: ["name", "imageUrl"],
        },
      ],
      order: [
        ["agentConfigurationVersion", "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: pagination.limit,
    });

    return agentMessageFeedback;
  }
  static async listByWorkspaceAndDateRange({
    workspace,
    startDate,
    endDate,
  }: {
    workspace: WorkspaceType;
    startDate: Date;
    endDate: Date;
  }): Promise<AgentMessageFeedbackResource[]> {
    const feedbacks = await AgentMessageFeedback.findAll({
      where: {
        workspaceId: workspace.id,
        createdAt: {
          [Op.and]: [{ [Op.gte]: startDate }, { [Op.lte]: endDate }],
        },
      },
    }).then((feedbacks) =>
      feedbacks.map((feedback) => new this(this.model, feedback.get()))
    );

    return feedbacks;
  }

  static async getConversationFeedbacksForUser(
    auth: Authenticator,
    conversation: ConversationType | ConversationWithoutContentType
  ): Promise<Result<AgentMessageFeedbackType[], ConversationError>> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected `auth` without `workspace`.");
    }
    const user = auth.user();
    if (!user) {
      throw new Error("Unexpected `auth` without `user`.");
    }

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

    const feedbacksWithMessageId = feedbackForMessages
      // typeguard needed because of TypeScript limitations
      .filter(
        (
          message
        ): message is Message & {
          agentMessage: { feedbacks: AgentMessageFeedbackResource[] };
        } =>
          !!message.agentMessage?.feedbacks &&
          message.agentMessage.feedbacks.length > 0
      )
      .map((message) => {
        // Only one feedback can be associated with a message
        const feedback = message.agentMessage.feedbacks[0];
        return {
          id: feedback.id,
          messageId: message.sId,
          agentMessageId: feedback.agentMessageId,
          userId: feedback.userId,
          thumbDirection: feedback.thumbDirection,
          content: feedback.content,
          isConversationShared: feedback.isConversationShared,
        } as AgentMessageFeedbackType;
      });

    return new Ok(feedbacksWithMessageId);
  }

  async fetchUser(): Promise<UserResource | null> {
    const users = await UserResource.fetchByModelIds([this.userId]);
    return users[0] ?? null;
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
      } & ( // Either the agent is not global and has a configuration
        | {
            agentConfiguration: Pick<
              AgentConfigurationType,
              "id" | "sId" | "version"
            >;
            isGlobalAgent: false;
          }
        // Or the agent is global and has no configuration
        | {
            agentConfiguration: null;
            isGlobalAgent: true;
          }
      ),
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
            "sId",
            "agentConfigurationId",
            "agentConfigurationVersion",
          ],
        },
      ],
    });

    if (!message || !message.agentMessageId) {
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
        agentConfiguration: null,
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
      return new Err(err as Error);
    }
  }
}
