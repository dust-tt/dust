import { convertMarkdownToHtml } from "@app/lib/md-to-html";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

function normalizeHtml(html: string): string {
  return (
    html
      // Normalize block-ids to a fixed value.
      .replace(/data-block-id="[^"]*"/g, 'data-block-id="xxx"')
      // Unwrap emoji spans: <span data-name="..." data-type="emoji">🟢</span> → 🟢
      .replace(
        /<span[^>]*data-type="emoji"[^>]*>([^<]*)<\/span>/g,
        "$1"
      )
      // Remove zero-width spaces inserted by preprocessMarkdownForEditor
      // for standalone < characters that aren't matched tag pairs.
      .replace(/\u200B/g, "")
      // Normalize whitespace around inline formatting tags (strong, em, code, a).
      // The frontend editor and markdown parser may place spaces inside or outside
      // marks differently, e.g. "✅<strong> Verified</strong>" vs "✅ <strong>Verified</strong>".
      .replace(/ (<(?:strong|em|code|a\b)[^>]*>)/g, "$1 ")
      .replace(/(<\/(?:strong|em|code|a)>) /g, " $1")
      // Remove trailing whitespace before closing block tags.
      // The frontend editor may preserve trailing spaces that the
      // markdown parser trims.
      .replace(/ +(<\/(?:p|li|h[1-6])>)/g, "$1")
      // Unwrap links whose text matches the href (auto-linked URLs and emails).
      .replace(
        /<a[^>]*href="(?:mailto:)?([^"]*)"[^>]*>\s*\1\s*<\/a>/g,
        "$1"
      )
      // Normalize leading whitespace after opening block tags.
      .replace(/(<(?:p|li|h[1-6])\b[^>]*>) +/g, "$1")
  );
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
          continue;
        }

        const generated = convertMarkdownToHtml(agent.instructions);
        if (
          normalizeHtml(generated) ===
          normalizeHtml(agent.instructionsHtml)
        ) {
          matchCount++;
        } else {
          mismatchCount++;

          // Diff on normalized HTML so block-id noise is removed.
          const normalizedStored = normalizeHtml(agent.instructionsHtml);
          const normalizedGenerated = normalizeHtml(generated);

          let diffIdx = 0;
          while (
            diffIdx < normalizedGenerated.length &&
            diffIdx < normalizedStored.length &&
            normalizedGenerated[diffIdx] === normalizedStored[diffIdx]
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
              storedLength: normalizedStored.length,
              generatedLength: normalizedGenerated.length,
              diffAtChar: diffIdx,
              storedSnippet: normalizedStored.slice(contextStart, contextEnd),
              generatedSnippet: normalizedGenerated.slice(
                contextStart,
                contextEnd
              ),
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
