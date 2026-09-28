import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

async function backfillWorkspace(
  workspace: LightWorkspaceType,
  { execute, logger }: { execute: boolean; logger: Logger }
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const agents = await AgentResource.listByWorkspace(auth, {
    status: ["active", "archived"],
  });
  const agentIds = agents.map((agent) => agent.sId);

  if (execute) {
    await AgentResource.launchSearchIndexation(auth, agentIds);
  }

  logger.info(
    {
      execute,
      workspaceId: workspace.sId,
      candidates: agentIds.length,
      attempted: execute ? agentIds.length : 0,
    },
    "[AgentSearchBackfill] Workspace complete"
  );
}

makeScript(
  {
    wId: {
      type: "string",
      describe: "Workspace sId to backfill (omit to run on all workspaces).",
    },
    fromWorkspaceModelId: {
      type: "number",
      describe: "Resume from this workspace model ID.",
    },
  },
  async ({ wId, fromWorkspaceModelId, execute }, logger) => {
    await runOnAllWorkspaces(
      (workspace) => backfillWorkspace(workspace, { execute, logger }),
      { wId, fromWorkspaceId: fromWorkspaceModelId }
    );
  }
);
