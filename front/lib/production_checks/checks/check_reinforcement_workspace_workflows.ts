import { Authenticator } from "@app/lib/auth";
import { hasReinforcementEnabled } from "@app/lib/reinforced_agent/workspace_check";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import type { CheckFunction } from "@app/types/production_checks";
import type { Client, WorkflowHandle } from "@temporalio/client";

function makeWorkspaceCronWorkflowId(workspaceId: string): string {
  return `reinforcement-workspace-${workspaceId}`;
}

async function getFlaggedWorkspaceIds(): Promise<string[]> {
  const allWorkspaces = await WorkspaceResource.listAll();
  const flaggedIds: string[] = [];

  for (const workspace of allWorkspaces) {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    if (await hasReinforcementEnabled(auth)) {
      flaggedIds.push(workspace.sId);
    }
  }

  return flaggedIds;
}

async function isWorkflowRunning(
  client: Client,
  workflowId: string
): Promise<boolean> {
  try {
    const handle: WorkflowHandle = client.workflow.getHandle(workflowId);
    const description = await handle.describe();
    return description.status.name === "RUNNING";
  } catch {
    return false;
  }
}

export const checkReinforcementWorkspaceWorkflows: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const workspaceIds = await getFlaggedWorkspaceIds();

  logger.info(
    { workspaceCount: workspaceIds.length },
    "Checking reinforcement workspace workflows."
  );

  const client = await getTemporalClientForFrontNamespace();

  const missingWorkflows: string[] = [];
  for (const workspaceId of workspaceIds) {
    heartbeat();
    const workflowId = makeWorkspaceCronWorkflowId(workspaceId);
    if (!(await isWorkflowRunning(client, workflowId))) {
      missingWorkflows.push(workspaceId);
    }
  }

  if (missingWorkflows.length > 0) {
    reportFailure(
      {
        missingWorkflows,
        actionLinks: missingWorkflows.map((wId) => ({
          label: `Missing reinforcement workflow for workspace ${wId}`,
          url: `/poke/${wId}`,
        })),
      },
      `Missing reinforcement workspace workflows for: ${missingWorkflows.join(", ")}.`
    );
  } else {
    reportSuccess();
  }
};
