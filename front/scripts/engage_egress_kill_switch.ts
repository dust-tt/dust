import config from "@app/lib/api/config";
import { KILL_DSBX_COMMAND } from "@app/lib/api/sandbox/egress";
import { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";

const KILL_TIMEOUT_MS = 10_000;
const KILL_CONCURRENCY = 8;

makeScript(
  {
    workspaceIds: {
      type: "string",
      description:
        "Comma-separated workspace sIds to scope the run to (defaults to all running sandboxes).",
    },
    limit: {
      type: "number",
      description: "Maximum number of running sandboxes to process.",
      default: 500,
    },
    force: {
      type: "boolean",
      description:
        "Bypass the in-process DSBX_DISABLE_MITM check. Only use after confirming a rolled front pod has DSBX_DISABLE_MITM=1; otherwise dsbx will respawn without the kill switch.",
      default: false,
    },
  },
  async ({ workspaceIds, limit, force, execute }, scriptLogger) => {
    const killSwitchEnabled = config.getEgressDisableMitm();

    if (execute && !killSwitchEnabled && !force) {
      throw new Error(
        "DSBX_DISABLE_MITM is unset in this process. The expected path is: flip the GCP secret, roll the front pods, then rerun this script (the env will be set, no --force needed). Use --force only as an escape hatch when you've confirmed another rolled front pod has DSBX_DISABLE_MITM=1 and will handle the next exec for the sandboxes you SIGKILL here."
      );
    }

    if (execute && force && !killSwitchEnabled) {
      scriptLogger.warn(
        { killSwitchEnabled, force: true },
        "Running with --force while DSBX_DISABLE_MITM is unset in this process. Respawned dsbx instances will not have the kill switch unless another rolled front pod handles the next exec."
      );
    }

    const parsedWorkspaceIds = workspaceIds
      ? workspaceIds
          .split(",")
          .map((workspaceId) => workspaceId.trim())
          .filter((workspaceId) => workspaceId.length > 0)
      : undefined;

    const entries =
      await SandboxResource.dangerouslyListRunningAcrossWorkspaces({
        workspaceIds: parsedWorkspaceIds,
        limit,
      });

    scriptLogger.info(
      {
        execute,
        killSwitchEnabled,
        limit,
        sandboxCount: entries.length,
        workspaceIds: parsedWorkspaceIds,
      },
      execute
        ? "Killing dsbx in running sandboxes for egress MITM kill switch"
        : "Dry run: listed running sandboxes for egress MITM kill switch"
    );

    const authByWorkspaceId = new Map<string, Authenticator>();
    let failureCount = 0;

    await concurrentExecutor(
      entries,
      async ({ sandbox, workspace }) => {
        const logContext = {
          providerId: sandbox.providerId,
          sandboxId: sandbox.sId,
          workspaceId: workspace.sId,
        };

        if (!execute) {
          scriptLogger.info(logContext, "Dry run: would kill dsbx in sandbox");
          return;
        }

        let auth = authByWorkspaceId.get(workspace.sId);
        if (!auth) {
          auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
          authByWorkspaceId.set(workspace.sId, auth);
        }

        const result = await sandbox.exec(auth, KILL_DSBX_COMMAND, {
          user: "root",
          timeoutMs: KILL_TIMEOUT_MS,
        });

        if (result.isErr()) {
          failureCount += 1;
          scriptLogger.error(
            { ...logContext, err: result.error },
            "Failed to kill dsbx in sandbox"
          );
          return;
        }

        scriptLogger.info(logContext, "Killed dsbx in sandbox");
      },
      { concurrency: KILL_CONCURRENCY }
    );

    if (failureCount > 0) {
      throw new Error(`Failed to kill dsbx in ${failureCount} sandbox(es)`);
    }
  }
);
