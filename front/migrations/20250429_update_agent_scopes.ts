import type { Logger } from "pino";

import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";
import { TagResource } from "@app/lib/resources/tags_resource";
import { Authenticator } from "@app/lib/auth";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";

const migrateWorkspace = async (
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
) => {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  logger.info({ workspace: workspace.sId }, "Migrating agents");
  const agents = await AgentConfiguration.findAll({
    where: {
      workspaceId: workspace.id,
    },
    order: [
      ["sId", "ASC"],
      ["version", "ASC"],
    ],
  });

  let companyTag = await TagResource.findByName(auth, "Company");
  if (!companyTag) {
    logger.info(
      {
        workspace: workspace.sId,
      },
      "Creating company tag"
    );

    if (execute) {
      companyTag = await TagResource.makeNew(auth, {
        name: "Company",
        kind: "protected",
      });
    }
  }

  for (const agent of agents) {
    const previousScope = agent.scope;
    if (
      previousScope === "workspace" ||
      previousScope === "published" ||
      previousScope === "private"
    ) {
      const newScope = previousScope === "private" ? "hidden" : "visible";
      logger.info(
        {
          workspace: workspace.sId,
          id: agent.id,
          agent: agent.sId,
          version: agent.version,
          previousScope,
          newScope,
        },
        "Migrating agent scope"
      );

      if (execute) {
        await agent.update({ scope: newScope }, { hooks: false, silent: true });
      }
      if (previousScope === "workspace" && agent.status === "active") {
        const agentConfigs = await getAgentConfigurations({
          auth,
          agentsGetView: { agentIds: [agent.sId] },
          variant: "light",
        });
        const agentConfig = agentConfigs[0];
        if (
          agentConfig &&
          !agentConfig.tags.some((tag) => tag.sId === companyTag.sId)
        ) {
          logger.info(
            {
              workspace: workspace.sId,
              agent: agent.sId,
              companyTag: companyTag?.sId,
            },
            "Adding company tag to agent"
          );
          if (execute && companyTag) {
            await companyTag.addToAgent(auth, agentConfig);
          }
        }
      }
    }
  }
};

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    if (wId) {
      const ws = await Workspace.findOne({ where: { sId: wId } });
      if (!ws) {
        throw new Error(`Workspace not found: ${wId}`);
      }
      await migrateWorkspace(
        renderLightWorkspaceType({ workspace: ws }),
        execute,
        logger
      );
    } else {
      await runOnAllWorkspaces(async (workspace) =>
        migrateWorkspace(workspace, execute, logger)
      );
    }

    logger.info("Agents migration completed");
  }
);
