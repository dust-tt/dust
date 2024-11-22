import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { CreationAttributes, Transaction } from "sequelize";
import type { Attributes, ModelStatic } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedback } from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

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
    agentConfigurationId,
  }: {
    agentConfigurationId: string;
  }): Promise<AgentMessageFeedbackResource[] | null> {
    const agentMessageFeedback = await AgentMessageFeedback.findAll({
      where: {
        agentConfigurationId,
      },
      order: [["id", "DESC"]],
    });

    return agentMessageFeedback.map(
      (feedback) =>
        new AgentMessageFeedbackResource(AgentMessageFeedback, feedback.get())
    );
  }

  static async fetchByUserAndMessageId({
    userId,
    agentMessageId,
  }: {
    userId: string;
    agentMessageId: string;
  }): Promise<AgentMessageFeedbackResource | null> {
    const agentMessageFeedback = await AgentMessageFeedback.findOne({
      where: {
        userId,
        agentMessageId,
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

  async updateContent({
    content,
  }: {
    content: string;
  }): Promise<Result<undefined, Error>> {
    try {
      await this.model.update(
        {
          content,
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
