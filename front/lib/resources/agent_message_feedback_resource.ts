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

import type {
  AgentMessageFeedbackType,
  AgentMessageFeedbackWithMetadataType,
} from "@app/lib/api/assistant/feedback";
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

  static async fetch({
    workspaceId,
    withMetadata,
    agentConfiguration,
    filters,
  }: {
    workspaceId: string;
    withMetadata: boolean;
    agentConfiguration?: AgentConfigurationType;
    filters?: {
      limit?: number;
      olderThan?: Date;
      earlierThan?: Date;
    };
  }): Promise<
    (AgentMessageFeedbackType | AgentMessageFeedbackWithMetadataType)[]
  > {
    const createdAtClause =
      !filters || (!filters.olderThan && !filters.earlierThan)
        ? {}
        : {
            createdAt: {
              [Op.and]: [
                filters.olderThan && filters.earlierThan
                  ? [
                      { [Op.lt]: filters.olderThan },
                      { [Op.gt]: filters.earlierThan },
                    ]
                  : filters.olderThan
                    ? { [Op.lt]: filters.olderThan }
                    : { [Op.gt]: filters.earlierThan },
              ],
            },
          };

    const agentMessageFeedback = await AgentMessageFeedback.findAll({
      where: {
        // Necessary for global models who share ids across workspaces
        workspaceId,
        // These clauses are optional
        agentConfigurationId: agentConfiguration?.id,
        ...createdAtClause,
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
                  attributes: ["id", "sId"],
                },
              ],
            },
          ],
        },
        {
          model: UserResource.model,
          attributes: ["name", "imageUrl", "email"],
        },
      ],
      order: [
        ["agentConfigurationVersion", "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: filters?.limit,
    });

    return (
      agentMessageFeedback
        // Typeguard needed because of TypeScript limitations
        .filter(
          (
            feedback
          ): feedback is AgentMessageFeedback & {
            agentMessage: { message: Message & { conversation: Conversation } };
          } => !!feedback.agentMessage?.message?.conversation
        )
        .map((feedback) => {
          return {
            id: feedback.id,
            messageId: feedback.agentMessage.message.sId,
            agentMessageId: feedback.agentMessageId,
            userId: feedback.userId,
            thumbDirection: feedback.thumbDirection,
            content: feedback.content
              ? feedback.content.replace(/\r?\n/g, "\\n")
              : null,
            isConversationShared: feedback.isConversationShared,
            createdAt: feedback.createdAt,
            agentConfigurationId: feedback.agentConfigurationId,
            agentConfigurationVersion: feedback.agentConfigurationVersion,

            ...(withMetadata && {
              // This field is sensitive, it allows accessing the conversation
              conversationId: feedback.isConversationShared
                ? feedback.agentMessage.message.conversation.sId
                : null,
              userName: feedback.user.name,
              userEmail: feedback.user.email,
              userImageUrl: feedback.user.imageUrl,
            }),
          };
        })
    );
  }

  static async getConversationFeedbacksForUser(
    auth: Authenticator,
    conversation: ConversationType | ConversationWithoutContentType
  ): Promise<Result<AgentMessageFeedbackType[], ConversationError | Error>> {
    const owner = auth.workspace();
    if (!owner) {
      return new Err(new Error("workspace_not_found"));
    }
    const user = auth.user();
    if (!user) {
      return new Err(new Error("user_not_found"));
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
          createdAt: feedback.createdAt,
          agentConfigurationId: feedback.agentConfigurationId,
          agentConfigurationVersion: feedback.agentConfigurationVersion,
        } as AgentMessageFeedbackType;
      });

    return new Ok(feedbacksWithMessageId);
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
}
