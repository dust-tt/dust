import type { Logger } from "pino";

import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

const migrateWorkspace = async (
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
) => {
  logger.info({ workspace: workspace.sId }, "Migrating agents");
  const agents = await AgentConfiguration.findAll({
    where: {
      workspaceId: workspace.id,
    },
  });

  for (const agent of agents) {
    if (agent.scope === "private") {
      logger.info({ agent: agent.sId }, "Migrating agent to scope hidden");
      if (execute) {
        await agent.update({ scope: "hidden" });
      }
    } else if (agent.scope === "workspace" || agent.scope === "published") {
      logger.info({ agent: agent.sId }, "Migrating agent to scope visible");
      if (execute) {
        await agent.update({ scope: "visible" });
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
