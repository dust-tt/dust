import { convertMarkdownToHtml } from "@app/lib/editor";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

function normalizeBlockIds(html: string): string {
  return html.replace(/data-block-id="[^"]*"/g, 'data-block-id="xxx"');
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Optional workspace ID to filter by.",
    },
    limit: {
      type: "number",
      description: "Maximum number of agents to process per workspace.",
      default: 1000,
    },
  },
  async ({ workspaceId, limit }, logger) => {
    let matchCount = 0;
    let mismatchCount = 0;
    let noHtmlCount = 0;
    let noInstructionsCount = 0;

    async function validateWorkspace(workspace: LightWorkspaceType) {
      const agents = await AgentConfigurationModel.findAll({
        where: {
          workspaceId: workspace.id,
          status: "active",
        },
        attributes: [
          "id",
          "sId",
          "name",
          "workspaceId",
          "instructions",
          "instructionsHtml",
        ],
        limit,
      });

      for (const agent of agents) {
        if (!agent.instructions) {
          noInstructionsCount++;
          continue;
        }

        if (!agent.instructionsHtml) {
          noHtmlCount++;
          logger.info(
            {
              agentSId: agent.sId,
              agentName: agent.name,
              workspaceId: workspace.sId,
            },
            "Agent has markdown but no HTML instructions"
          );
          continue;
        }

        const generated = convertMarkdownToHtml(agent.instructions);
        if (
          normalizeBlockIds(generated) ===
          normalizeBlockIds(agent.instructionsHtml)
        ) {
          matchCount++;
        } else {
          mismatchCount++;

          // Find first divergence point for a concise diff.
          let diffIdx = 0;
          while (
            diffIdx < generated.length &&
            diffIdx < agent.instructionsHtml.length &&
            generated[diffIdx] === agent.instructionsHtml[diffIdx]
          ) {
            diffIdx++;
          }
          const contextStart = Math.max(0, diffIdx - 40);
          const contextEnd = diffIdx + 80;

          logger.warn(
            {
              agentSId: agent.sId,
              agentName: agent.name,
              workspaceId: workspace.sId,
              storedLength: agent.instructionsHtml.length,
              generatedLength: generated.length,
              diffAtChar: diffIdx,
              storedSnippet: agent.instructionsHtml.slice(
                contextStart,
                contextEnd
              ),
              generatedSnippet: generated.slice(contextStart, contextEnd),
            },
            "HTML instructions mismatch"
          );
        }
      }
    }

    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        logger.error({ workspaceId }, "Workspace not found");
        return;
      }
      await validateWorkspace(renderLightWorkspaceType({ workspace }));
    } else {
      await runOnAllWorkspaces(validateWorkspace);
    }

    logger.info(
      {
        matchCount,
        mismatchCount,
        noHtmlCount,
        noInstructionsCount,
      },
      "Validation complete"
    );
  }
);
