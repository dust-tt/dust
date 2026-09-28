import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { MentionModel } from "@app/lib/models/agent/conversation";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Destroys a draft agent configuration and all associated configurations.
 *
 * /!\ Only deletes draft agent configuration if it hasn't been used in any messages.
 */
async function deleteDraftAgentConfigurationAndRelatedResources(
  workspace: LightWorkspaceType,
  agent: AgentConfigurationModel,
  logger: Logger,
  execute: boolean
): Promise<Result<boolean, Error>> {
  if (agent.status !== "draft") {
    logger.info(`Agent ${agent.sId} is not in draft status. Skipping.`);
    return new Ok(false);
  }

  // Only deletes draft agent configuration without mentions.
  const hasAtLeastOneMention = await MentionModel.findOne({
    where: {
      workspaceId: workspace.id,
      agentConfigurationId: agent.sId,
    },
  });
  if (hasAtLeastOneMention) {
    logger.info(`Agent ${agent.sId} has related messages. Skipping.`);

    return new Ok(false);
  }

  // If in dry run, return early.
  if (!execute) {
    return new Ok(true);
  }

  // `AgentResource.delete` hard-deletes the draft agent and all its satellites (tools and their
  // data-source / table / child-agent links, tags, skills, suggestions), its permission grants and
  // groups, and the identity row.
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const [agentResource] =
    await AgentResource.dangerouslyFromConfigurationModels(auth, [agent]);
  const deleteResult = await agentResource.delete(auth);
  if (deleteResult.isErr()) {
    return new Err(deleteResult.error);
  }

  return new Ok(true);
}

async function removeDraftAgentConfigurationsForWorkspace(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  let nbAgentsDeleted = 0;

  const draftAgents = await AgentConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      status: "draft",
    },
    attributes: [
      "id",
      "sId",
      "status",
      "agentId",
      "authorId",
      "scope",
      "workspaceId",
    ],
  });

  if (draftAgents.length === 0) {
    logger.info(
      `No draft agents found for workspace(${workspace.sId}). Skipping.`
    );
    return;
  }

  logger.info(
    `Found ${draftAgents.length} draft agents for workspace(${workspace.sId}).`
  );

  for (const agent of draftAgents) {
    const result = await deleteDraftAgentConfigurationAndRelatedResources(
      workspace,
      agent,
      logger,
      execute
    );

    if (result.isErr()) {
      logger.error(
        { workspaceId: workspace.id, agentId: agent.sId, error: result.error },
        "Failed to delete draft agent."
      );
      continue;
    }

    if (result.value) {
      nbAgentsDeleted++;
      logger.info(`Agent ${agent.sId} has been deleted.`);
    }
  }

  logger.info(
    `Deleted ${nbAgentsDeleted}/${draftAgents.length} draft agents for workspace(${workspace.sId}).`
  );
}

makeScript(
  {
    concurrency: {
      type: "number",
      description: "The number of workspaces to process concurrently.",
      default: 8,
    },
    workspaceId: {
      type: "string",
      description: "A single workspace id.",
    },
  },
  async ({ workspaceId, execute }, logger) => {
    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        logger.info({ workspaceId }, "Workspace not found!");
        return;
      }

      return removeDraftAgentConfigurationsForWorkspace(
        renderLightWorkspaceType({ workspace }),
        logger,
        execute
      );
    }

    return runOnAllWorkspaces(async (workspace) => {
      await removeDraftAgentConfigurationsForWorkspace(
        workspace,
        logger,
        execute
      );
    });
  }
);
