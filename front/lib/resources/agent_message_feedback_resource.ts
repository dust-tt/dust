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
import type { Attributes, ModelStatic, WhereOptions } from "sequelize";
import type { CreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";

import type {
  AgentMessageFeedbackType,
  AgentMessageFeedbackWithMetadataType,
} from "@app/lib/api/assistant/feedback";
import type { PaginationParams } from "@app/lib/api/pagination";
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

  static async fetch({
    workspace,
    withMetadata,
    agentConfiguration,
    paginationParams,
  }: {
    workspace: WorkspaceType;
    withMetadata: boolean;
    agentConfiguration?: AgentConfigurationType;
    paginationParams: PaginationParams;
  }): Promise<
    (AgentMessageFeedbackType | AgentMessageFeedbackWithMetadataType)[]
  > {
    const where: WhereOptions<AgentMessageFeedback> = {
      // IMPORTANT: Necessary for global models who share ids across workspaces.
      workspaceId: workspace.id,
    };

    if (paginationParams.lastValue) {
      const op = paginationParams.orderDirection === "desc" ? Op.lt : Op.gt;
      where[paginationParams.orderColumn as any] = {
        [op]: paginationParams.lastValue,
      };
    }
    if (agentConfiguration) {
      where.agentConfigurationId = agentConfiguration.sId.toString();
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
          as: "user",
          attributes: ["name", "imageUrl", "email"],
        },
      ],
      order: [
        [
          paginationParams.orderColumn,
          paginationParams.orderDirection === "desc" ? "DESC" : "ASC",
        ],
      ],
      limit: paginationParams.limit,
    });

    return (
      agentMessageFeedback
        // Typeguard needed because of TypeScript limitations
        .filter(
          (
            feedback
          ): feedback is AgentMessageFeedback & {
            agentMessage: {
              message: Message & { conversation: Conversation };
            };
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

    return agentMessageFeedback.map((feedback) => {
      return {
        id: feedback.id,
        createdAt: feedback.createdAt,
        userName: feedback.user.name,
        userEmail: feedback.user.email,
        agentConfigurationId: feedback.agentConfigurationId,
        agentConfigurationVersion: feedback.agentConfigurationVersion,
        thumb: feedback.thumbDirection,
        content: feedback.content?.replace(/\r?\n/g, "\\n") || null,
      };
    });
  }

  static async getConversationFeedbacksForUser(
    auth: Authenticator,
    conversation: ConversationType | ConversationWithoutContentType
  ): Promise<Result<AgentMessageFeedbackType[], ConversationError | Error>> {
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
}
