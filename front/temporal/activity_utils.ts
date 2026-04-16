import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/temporal/workflow_utils";
import { Context } from "@temporalio/activity";

const DEFAULT_WORKSPACE_CONCURRENCY = 50;

/**
 * List all workspaces and run `fn` on each in parallel (activity-safe, heartbeats
 * after every workspace). When `excludePlanCodes` is provided, workspaces on
 * those plans are silently skipped.
 */
export async function runOnAllWorkspacesInActivity<T>(
  fn: (auth: Authenticator, workspace: WorkspaceResource) => Promise<T>,
  options?: { concurrency?: number; excludePlanCodes?: Set<string> }
): Promise<T[]> {
  const allWorkspaces = await WorkspaceResource.listAll();
  const concurrency = options?.concurrency ?? DEFAULT_WORKSPACE_CONCURRENCY;

  // Build authenticators concurrently, then filter by plan if needed.
  let workspacesWithAuth = await concurrentExecutor(
    allWorkspaces,
    async (workspace) => {
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      Context.current().heartbeat();
      return { workspace, auth };
    },
    { concurrency }
  );

  if (options?.excludePlanCodes) {
    const excluded = options.excludePlanCodes;
    workspacesWithAuth = workspacesWithAuth.filter(({ auth }) => {
      const planCode = auth.plan()?.code;
      return !(planCode && excluded.has(planCode));
    });
  }

  return concurrentExecutor(
    workspacesWithAuth,
    async ({ auth, workspace }) => {
      const result = await fn(auth, workspace);
      Context.current().heartbeat();
      return result;
    },
    { concurrency }
  );
}
