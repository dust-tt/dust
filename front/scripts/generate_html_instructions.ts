import { convertMarkdownToHtml } from "@app/lib/md-to-html";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Optional workspace ID. If omitted, runs on all workspaces.",
    },
    agentId: {
      type: "string",
      description:
        "Optional agent sId. Requires workspaceId. If omitted, runs on all agents in the workspace.",
    },
  },
  async ({ workspaceId, agentId }, logger) => {
    if (agentId && !workspaceId) {
      logger.error("agentId requires workspaceId");
      return;
    }

    let generatedCount = 0;
    let skippedAlreadyHasHtmlCount = 0;
    let skippedNoMarkdownCount = 0;

    async function processWorkspace(workspace: LightWorkspaceType) {
      const where: Record<string, unknown> = {
        workspaceId: workspace.id,
        status: "active",
        instructions: { [Op.ne]: null },
        instructionsHtml: { [Op.is]: null },
      };

      if (agentId) {
        where.sId = agentId;
      }

      const agents = await AgentConfigurationModel.findAll({
        where,
        attributes: ["id", "sId", "name", "workspaceId", "instructions"],
      });

      for (const agent of agents) {
        const html = convertMarkdownToHtml(agent.instructions!);

        await AgentConfigurationModel.update(
          { instructionsHtml: html },
          { where: { id: agent.id } }
        );

        generatedCount++;
        logger.info(
          {
            agentSId: agent.sId,
            agentName: agent.name,
            workspaceId: workspace.sId,
            htmlLength: html.length,
          },
          "Generated HTML instructions"
        );
      }
    }

    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        logger.error({ workspaceId }, "Workspace not found");
        return;
      }

      // Count skipped agents for reporting.
      const lightWorkspace = renderLightWorkspaceType({ workspace });

      const alreadyHasHtml = await AgentConfigurationModel.count({
        where: {
          workspaceId: lightWorkspace.id,
          status: "active",
          instructions: { [Op.ne]: null },
          instructionsHtml: { [Op.ne]: null },
          ...(agentId ? { sId: agentId } : {}),
        },
      });
      skippedAlreadyHasHtmlCount = alreadyHasHtml;

      const noMarkdown = await AgentConfigurationModel.count({
        where: {
          workspaceId: lightWorkspace.id,
          status: "active",
          instructions: { [Op.is]: null },
          ...(agentId ? { sId: agentId } : {}),
        },
      });
      skippedNoMarkdownCount = noMarkdown;

      await processWorkspace(lightWorkspace);
    } else {
      await runOnAllWorkspaces(processWorkspace);
    }

    logger.info(
      {
        generatedCount,
        skippedAlreadyHasHtmlCount,
        skippedNoMarkdownCount,
      },
      "Generation complete"
    );
  }
);
