import type {
  AgentConfigurationType,
  Result,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic } from "sequelize";
import type { CreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";

import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMessage } from "@app/lib/models/assistant/conversation";
import { AgentMessageFeedback } from "@app/lib/models/assistant/conversation";
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

  static async listByAgentConfigurationId({
    agentConfiguration,
  }: {
    agentConfiguration: AgentConfigurationType;
  }): Promise<AgentMessageFeedbackResource[] | null> {
    const agentMessageFeedback = await AgentMessageFeedback.findAll({
      where: {
        agentConfigurationId: agentConfiguration.sId,
      },
      order: [["id", "DESC"]],
    });

    return agentMessageFeedback.map(
      (feedback) => new this(this.model, feedback.get())
    );
  }

  static async fetchByUserAndAgentMessage({
    user,
    agentMessage,
  }: {
    user: UserType;
    agentMessage: AgentMessage;
  }): Promise<AgentMessageFeedbackResource | null> {
    const agentMessageFeedback = await AgentMessageFeedback.findOne({
      where: {
        userId: user.id,
        agentMessageId: agentMessage.id,
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

  static async fetchByUserAndAgentMessages(
    user: UserType,
    agentMessages: AgentMessage[]
  ): Promise<AgentMessageFeedbackResource[]> {
    const agentMessageFeedback = await AgentMessageFeedback.findAll({
      where: {
        userId: user.id,
        agentMessageId: {
          [Op.in]: agentMessages.map((m) => m.id),
        },
      },
    });

    return agentMessageFeedback.map(
      (feedback) => new this(this.model, feedback.get())
    );
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

  async fetchUser(): Promise<UserResource | null> {
    const users = await UserResource.fetchByModelIds([this.userId]);
    return users[0] ?? null;
  }

  async updateContentAndThumbDirection(
    content: string,
    thumbDirection: AgentMessageFeedbackDirection
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.update(
        {
          content,
          thumbDirection,
        },
        {
          where: {
            id: this.id,
          },
        }
      );

      return new Ok(undefined);
    } catch (error) {
      return new Err(error as Error);
    }
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
