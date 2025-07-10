import _ from "lodash";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { canReadMessage } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ModelId, Result } from "@app/types";
import { Err, Ok } from "@app/types";
import type { AgentStepContentType } from "@app/types/assistant/agent_message_content";

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

  /**
   * Helper function to check if the user can read the agent message
   * and fetch the agent configuration.
   */
  private static async checkAgentMessageAccess(
    auth: Authenticator,
    agentMessageId: number
  ): Promise<void> {
    const agentMessage = await AgentMessage.findOne({
      where: {
        id: agentMessageId,
      },
      include: [
        {
          model: Message,
          as: "message",
          required: true,
        },
      ],
    });

    if (!agentMessage || !agentMessage.message) {
      throw new Error(
        `Unexpected: Agent message not found for agentMessageId: ${agentMessageId}`
      );
    }

    // Fetch agent configuration to check permissions
    const agentConfigurations = await getAgentConfigurations({
      auth,
      agentsGetView: { agentIds: [agentMessage.agentConfigurationId] },
      variant: "light",
    });

    if (agentConfigurations.length === 0) {
      throw new Error(
        `Unexpected: User does not have access to agent configuration: ${agentMessage.agentConfigurationId}`
      );
    }

    const agentConfiguration = agentConfigurations[0];

    // Check if user can read the message using the configuration
    const canRead = canReadMessage(auth, {
      configuration: agentConfiguration,
    } as any);

    if (!canRead) {
      throw new Error(
        `Unexpected: User does not have permission to read agent message: ${agentMessageId}`
      );
    }
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

  /**
   * Helper to build the include clause for MCP actions
   */
  private static buildMCPActionsInclude({
    includeMCPActions,
  }: {
    includeMCPActions: boolean;
  }) {
    if (!includeMCPActions) {
      return [];
    }

    return [
      {
        model: AgentMCPAction,
        as: "agentMCPActions",
        required: false,
      },
    ];
  }

  /**
   * Helper to filter latest versions from fetched content
   */
  private static filterLatestVersions(
    contents: AgentStepContentModel[],
    groupByFields: string[]
  ): AgentStepContentModel[] {
    const grouped = _.groupBy(contents, (content) =>
      groupByFields
        .map((field) => content[field as keyof AgentStepContentModel])
        .join("-")
    );

    // For each group, keep only the first item (already sorted by version DESC)
    return Object.values(grouped).map((group) => group[0]);
  }

  /**
   * Helper to filter latest MCP actions within each step content
   */
  private static filterLatestMCPActions(
    contents: AgentStepContentModel[]
  ): void {
    for (const content of contents) {
      if (
        "agentMCPActions" in content &&
        Array.isArray((content as any).agentMCPActions)
      ) {
        const mcpActions = (content as any).agentMCPActions as AgentMCPAction[];

        if (mcpActions.length > 0) {
          // Keep only the action with the highest version
          const maxVersionAction = _.maxBy(mcpActions, "version");
          (content as any).agentMCPActions = maxVersionAction
            ? [maxVersionAction]
            : [];
        }
      }
    }
  }

  /**
   * Helper to create resources from models
   */
  private static createResources(
    contents: AgentStepContentModel[]
  ): AgentStepContentResource[] {
    return contents.map(
      (content) =>
        new AgentStepContentResource(AgentStepContentModel, content.get())
    );
  }

  static async fetchByAgentMessage({
    auth,
    agentMessageId,
    transaction,
    includeMCPActions = false,
    latestVersionsOnly = false,
  }: {
    auth: Authenticator;
    agentMessageId: number;
    transaction?: Transaction;
    includeMCPActions?: boolean;
    latestVersionsOnly?: boolean;
  }): Promise<AgentStepContentResource[]> {
    const owner = auth.getNonNullableWorkspace();

    // Check authorization - will throw if unauthorized
    await this.checkAgentMessageAccess(auth, agentMessageId);

    const include = this.buildMCPActionsInclude({
      includeMCPActions,
    });

    const agentStepContents = await AgentStepContentModel.findAll({
      where: {
        workspaceId: owner.id,
        agentMessageId,
      },
      include,
      order: [
        ["step", "ASC"],
        ["index", "ASC"],
        ["version", "DESC"],
      ],
      transaction,
    });

    let contents = agentStepContents;

    if (latestVersionsOnly) {
      contents = this.filterLatestVersions(contents, ["step", "index"]);

      // Also filter MCP actions to latest versions if included
      if (includeMCPActions) {
        this.filterLatestMCPActions(contents);
      }
    }

    return this.createResources(contents);
  }

  static async fetchByAgentMessageAndStep({
    auth,
    agentMessageId,
    step,
    transaction,
    includeMCPActions = false,
    latestVersionsOnly = false,
  }: {
    auth: Authenticator;
    agentMessageId: number;
    step: number;
    transaction?: Transaction;
    includeMCPActions?: boolean;
    latestVersionsOnly?: boolean;
  }): Promise<AgentStepContentResource[]> {
    const owner = auth.getNonNullableWorkspace();

    // Check authorization - will throw if unauthorized
    await this.checkAgentMessageAccess(auth, agentMessageId);

    const include = this.buildMCPActionsInclude({
      includeMCPActions,
    });

    const agentStepContents = await AgentStepContentModel.findAll({
      where: {
        workspaceId: owner.id,
        agentMessageId,
        step,
      },
      include,
      order: [
        ["index", "ASC"],
        ["version", "DESC"],
      ],
      transaction,
    });

    let contents = agentStepContents;

    if (latestVersionsOnly) {
      contents = this.filterLatestVersions(contents, ["index"]);

      // Also filter MCP actions to latest versions if included
      if (includeMCPActions) {
        this.filterLatestMCPActions(contents);
      }
    }

    return this.createResources(contents);
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

  toJSON(): AgentStepContentType {
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

    // If the resource was fetched with MCP actions included, serialize them
    if (
      "agentMCPActions" in this &&
      Array.isArray((this as any).agentMCPActions)
    ) {
      const mcpActions = (this as any).agentMCPActions as AgentMCPAction[];

      // MCP actions filtering already happened in fetch methods if latestVersionsOnly was requested
      base.mcpActions = mcpActions.map((action: AgentMCPAction) => {
        const resource = new AgentMCPActionResource(
          AgentMCPAction,
          action.get ? action.get() : action
        );
        return resource.toJSON();
      });
    }

    return base;
  }
}
