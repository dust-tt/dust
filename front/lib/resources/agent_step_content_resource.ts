import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ModelId, Result } from "@app/types";
import { Err, Ok } from "@app/types";
import type { AgentStepContentType } from "@app/types/assistant/agent_step_content";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface AgentStepContentResource
  extends ReadonlyAttributesType<AgentStepContentModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentStepContentResource extends BaseResource<AgentStepContentModel> {
  static model: ModelStatic<AgentStepContentModel> = AgentStepContentModel;

  constructor(
    model: ModelStatic<AgentStepContentModel>,
    blob: Attributes<AgentStepContentModel>
  ) {
    super(AgentStepContentModel, blob);
  }

  static async makeNew(
    blob: CreationAttributes<AgentStepContentModel>,
    transaction?: Transaction
  ): Promise<AgentStepContentResource> {
    const agentStepContent = await AgentStepContentModel.create(blob, {
      transaction,
    });

    return new AgentStepContentResource(
      AgentStepContentModel,
      agentStepContent.get()
    );
  }

  get sId(): string {
    return AgentStepContentResource.modelIdToSId({
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
    return makeSId("agent_step_content", {
      id,
      workspaceId,
    });
  }

  static async fetchByAgentMessage({
    auth,
    agentMessageId,
    transaction,
  }: {
    auth: Authenticator;
    agentMessageId: number;
    transaction?: Transaction;
  }): Promise<AgentStepContentResource[]> {
    const owner = auth.getNonNullableWorkspace();

    const agentStepContents = await AgentStepContentModel.findAll({
      where: {
        workspaceId: owner.id,
        agentMessageId,
      },
      order: [
        ["step", "ASC"],
        ["index", "ASC"],
        ["version", "DESC"],
      ],
      transaction,
    });

    return agentStepContents.map(
      (content) =>
        new AgentStepContentResource(AgentStepContentModel, content.get())
    );
  }

  static async fetchByAgentMessageAndStep({
    auth,
    agentMessageId,
    step,
    transaction,
  }: {
    auth: Authenticator;
    agentMessageId: number;
    step: number;
    transaction?: Transaction;
  }): Promise<AgentStepContentResource[]> {
    const owner = auth.getNonNullableWorkspace();

    const agentStepContents = await AgentStepContentModel.findAll({
      where: {
        workspaceId: owner.id,
        agentMessageId,
        step,
      },
      order: [
        ["index", "ASC"],
        ["version", "DESC"],
      ],
      transaction,
    });

    return agentStepContents.map(
      (content) =>
        new AgentStepContentResource(AgentStepContentModel, content.get())
    );
  }

  static async fetchLatestByAgentMessage({
    auth,
    agentMessageId,
    transaction,
  }: {
    auth: Authenticator;
    agentMessageId: number;
    transaction?: Transaction;
  }): Promise<AgentStepContentResource[]> {
    const owner = auth.getNonNullableWorkspace();

    // Fetch all contents and group by step/index to get the latest version of each.
    const allContents = await AgentStepContentModel.findAll({
      where: {
        workspaceId: owner.id,
        agentMessageId,
      },
      order: [
        ["step", "ASC"],
        ["index", "ASC"],
        ["version", "DESC"],
      ],
      transaction,
    });

    // Group by step and index, keeping only the latest version.
    const latestContents = new Map<string, AgentStepContentModel>();
    for (const content of allContents) {
      const key = `${content.step}-${content.index}`;
      if (!latestContents.has(key)) {
        latestContents.set(key, content);
      }
    }

    return Array.from(latestContents.values()).map(
      (content) =>
        new AgentStepContentResource(AgentStepContentModel, content.get())
    );
  }

  static async fetchWithMCPActions({
    auth,
    agentMessageId,
    transaction,
  }: {
    auth: Authenticator;
    agentMessageId: number;
    transaction?: Transaction;
  }): Promise<AgentStepContentResource[]> {
    const owner = auth.getNonNullableWorkspace();

    const agentStepContents = await AgentStepContentModel.findAll({
      where: {
        workspaceId: owner.id,
        agentMessageId,
      },
      include: [
        {
          model: AgentMCPAction,
          as: "agentMCPActions",
          required: false,
        },
      ],
      order: [
        ["step", "ASC"],
        ["index", "ASC"],
        ["version", "DESC"],
      ],
      transaction,
    });

    return agentStepContents.map(
      (content) =>
        new AgentStepContentResource(AgentStepContentModel, content.get())
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<number | undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();

    if (this.workspaceId !== owner.id) {
      return new Err(
        new Error("Cannot delete agent step content from another workspace")
      );
    }

    const deletedCount = await AgentStepContentModel.destroy({
      where: {
        id: this.id,
        workspaceId: owner.id,
      },
      transaction,
    });

    return new Ok(deletedCount);
  }

  async toJSON(includeActions = false): Promise<AgentStepContentType> {
    const base: AgentStepContentType = {
      id: this.id,
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      agentMessageId: this.agentMessageId,
      step: this.step,
      index: this.index,
      version: this.version,
      type: this.type,
      value: this.value,
    };

    if (includeActions) {
      const mcpActions = await AgentMCPAction.findAll({
        where: {
          stepContentId: this.id,
        },
      });
      base.mcpActionIds = mcpActions.map((action) => action.id);
    }

    return base;
  }
}
