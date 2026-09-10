import { deleteLegacyPodOwnedSandbox } from "@app/lib/api/sandbox/legacy_pod_sandbox";
import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { SandboxOwnerModel } from "@app/lib/resources/storage/models/sandbox";
import {
  SandboxFunctionInvocationModel,
  SandboxFunctionModel,
} from "@app/lib/resources/storage/models/sandbox_function";
import { SandboxFunctionMCPActionModel } from "@app/lib/resources/storage/models/sandbox_function_mcp_action";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Op } from "sequelize";

// Scrubs the database rows left behind by Pod functions and pod-owned sandboxes, both of which no
// longer exist in code. Nothing creates these rows any more, so a clean run leaves the workspace
// with no `spaceId` on `sandbox_functions` or `sandbox_owners`.
//
// Per workspace, in this order:
//
//  1. Pod-owned sandboxes: destroy at the provider, then drop the `sandbox_owners` row and the
//     `sandboxes` row.
//  2. Pod functions: their MCP action rows, then their invocation rows, then the function rows,
//     then the published bundle `files` rows each one owns. That order is the FK order — every
//     link in the chain is `onDelete: "RESTRICT"`.
//
// DELIBERATELY NOT GCS. This only deletes rows. The objects those rows pointed at stay where they
// are: invocation payload blobs, MCP action outputs, published function bundles, the pod
// litestream state replica and the read-only bundle mount. They become unreferenced, and reclaiming
// them is a separate job. The provider (E2B) sandbox in step 1 IS destroyed — that is a running VM,
// not storage, and nothing else can reach it once its owner link is gone.
//
// Run it as soon as this ships. Until it does, a pod that booted a sandbox before the owner kind
// was removed keeps that sandbox running at the provider forever: the reaper has no owner adapter
// for it any more and skips it. `deleteLegacyPodOwnedSandbox` is the one path left that can still
// reach one.
//
// Idempotent and resumable: every step is keyed on rows that still carry a `spaceId`, so
// re-running only picks up what a previous run did not finish.

const WORKSPACE_CONCURRENCY = 1;

type WorkspaceOutcome = {
  deletedSandboxes: number;
  deletedFunctions: number;
  deletedInvocations: number;
  deletedMcpActions: number;
  deletedFiles: number;
};

const EMPTY_OUTCOME: WorkspaceOutcome = {
  deletedSandboxes: 0,
  deletedFunctions: 0,
  deletedInvocations: 0,
  deletedMcpActions: 0,
  deletedFiles: 0,
};

/** The pods this workspace still has pod-scoped sandbox or function rows for. */
async function fetchPodModelIdsWithLegacyRows(
  workspaceModelId: ModelId
): Promise<{ sandboxPodModelIds: ModelId[]; functionPodModelIds: ModelId[] }> {
  const [owners, functions] = await Promise.all([
    SandboxOwnerModel.findAll({
      attributes: ["spaceId"],
      where: { workspaceId: workspaceModelId, spaceId: { [Op.ne]: null } },
    }),
    SandboxFunctionModel.findAll({
      attributes: ["spaceId"],
      where: { workspaceId: workspaceModelId, spaceId: { [Op.ne]: null } },
    }),
  ]);

  return {
    sandboxPodModelIds: [
      ...new Set(owners.flatMap(({ spaceId }) => (spaceId ? [spaceId] : []))),
    ],
    functionPodModelIds: [
      ...new Set(
        functions.flatMap(({ spaceId }) => (spaceId ? [spaceId] : []))
      ),
    ],
  };
}

async function destroyPodOwnedSandbox(
  auth: Authenticator,
  pod: SpaceResource,
  { execute, logger }: { execute: boolean; logger: Logger }
): Promise<number> {
  if (!execute) {
    logger.info("[DRY RUN] Would destroy pod sandbox");
    return 0;
  }

  const result = await deleteLegacyPodOwnedSandbox(auth, pod, {
    dropOwnerLink: true,
  });
  if (result.isErr()) {
    throw result.error;
  }

  logger.info("Destroyed pod sandbox and dropped its link");
  return 1;
}

/**
 * Delete every row scoped to `pod`: its function rows, their execution history, and the bundle
 * `files` rows the functions own. Their GCS objects are left behind (see the module comment).
 *
 * Read straight off the models rather than through the resources, whose fetch paths only hydrate
 * Frame functions now — a pod function would come back as nothing, and the resource deletes reach
 * into GCS.
 */
async function deletePodFunctionRows(
  auth: Authenticator,
  pod: SpaceResource,
  { execute, logger }: { execute: boolean; logger: Logger }
): Promise<Omit<WorkspaceOutcome, "deletedSandboxes">> {
  const workspaceModelId = auth.getNonNullableWorkspace().id;
  const functions = await SandboxFunctionModel.findAll({
    attributes: ["id", "fileId", "slug"],
    where: { workspaceId: workspaceModelId, spaceId: pod.id },
  });
  if (functions.length === 0) {
    return {
      deletedFunctions: 0,
      deletedInvocations: 0,
      deletedMcpActions: 0,
      deletedFiles: 0,
    };
  }

  const sandboxFunctionModelIds = functions.map(({ id }) => id);
  const fileModelIds = [...new Set(functions.map(({ fileId }) => fileId))];
  const invocations = await SandboxFunctionInvocationModel.findAll({
    attributes: ["id"],
    where: {
      workspaceId: workspaceModelId,
      sandboxFunctionId: sandboxFunctionModelIds,
    },
  });
  const invocationModelIds = invocations.map(({ id }) => id);

  if (!execute) {
    logger.info(
      {
        functionCount: functions.length,
        invocationCount: invocationModelIds.length,
        fileCount: fileModelIds.length,
        slugs: functions.map(({ slug }) => slug),
      },
      "[DRY RUN] Would delete pod function rows, their history and their bundle file rows"
    );
    return {
      deletedFunctions: 0,
      deletedInvocations: 0,
      deletedMcpActions: 0,
      deletedFiles: 0,
    };
  }

  // FK order: actions reference invocations, invocations reference functions, and functions
  // reference their bundle file — all with RESTRICT, so each set has to go before the next.
  const deletedMcpActions =
    invocationModelIds.length === 0
      ? 0
      : await SandboxFunctionMCPActionModel.destroy({
          where: {
            workspaceId: workspaceModelId,
            sandboxFunctionInvocationId: invocationModelIds,
          },
        });

  const deletedInvocations = await SandboxFunctionInvocationModel.destroy({
    where: {
      workspaceId: workspaceModelId,
      sandboxFunctionId: sandboxFunctionModelIds,
    },
  });

  const deletedFunctions = await SandboxFunctionModel.destroy({
    where: { id: sandboxFunctionModelIds, workspaceId: workspaceModelId },
  });

  // A published bundle is the only thing that ever referenced these files. Anything else pointing
  // at one (a share, a skill attachment) also FKs with RESTRICT, so an unexpected reference fails
  // this workspace loudly rather than orphaning the row.
  const deletedFiles = await FileModel.destroy({
    where: { id: fileModelIds, workspaceId: workspaceModelId },
  });

  logger.info(
    { deletedFunctions, deletedInvocations, deletedMcpActions, deletedFiles },
    "Deleted pod function rows"
  );

  return {
    deletedFunctions,
    deletedInvocations,
    deletedMcpActions,
    deletedFiles,
  };
}

async function cleanupWorkspace(
  workspaceId: string,
  { execute, logger }: { execute: boolean; logger: Logger }
): Promise<WorkspaceOutcome> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId, {
    dangerouslyRequestAllGroups: true,
  });
  const workspaceModelId = auth.getNonNullableWorkspace().id;

  const { sandboxPodModelIds, functionPodModelIds } =
    await fetchPodModelIdsWithLegacyRows(workspaceModelId);
  const podModelIds = [
    ...new Set([...sandboxPodModelIds, ...functionPodModelIds]),
  ];
  if (podModelIds.length === 0) {
    return EMPTY_OUTCOME;
  }

  // `includeDeleted`: a soft-deleted pod still owns its rows, and they still have to go.
  const pods = await SpaceResource.fetchByModelIds(auth, podModelIds, {
    includeDeleted: true,
  });
  const podsById = new Map(pods.map((pod) => [pod.id, pod]));

  const outcome = { ...EMPTY_OUTCOME };
  for (const podModelId of podModelIds) {
    const pod = podsById.get(podModelId);
    if (!pod) {
      // Should never happen: the FK is RESTRICT both ways, so the pod outlives its rows.
      logger.error(
        { workspaceId, podModelId },
        "Pod not found for its own legacy sandbox rows — skipping"
      );
      continue;
    }

    const podLogger = logger.child({ workspaceId, podId: pod.sId });

    if (sandboxPodModelIds.includes(podModelId)) {
      outcome.deletedSandboxes += await destroyPodOwnedSandbox(auth, pod, {
        execute,
        logger: podLogger,
      });
    }

    if (functionPodModelIds.includes(podModelId)) {
      const functions = await deletePodFunctionRows(auth, pod, {
        execute,
        logger: podLogger,
      });
      outcome.deletedFunctions += functions.deletedFunctions;
      outcome.deletedInvocations += functions.deletedInvocations;
      outcome.deletedMcpActions += functions.deletedMcpActions;
      outcome.deletedFiles += functions.deletedFiles;
    }
  }

  return outcome;
}

makeScript(
  {
    wId: {
      type: "string",
      describe: "Workspace to clean up (omit to run on all workspaces).",
    },
    fromWorkspaceModelId: {
      type: "number",
      describe:
        "Skip workspaces with a model id below this value, to resume a partial run.",
    },
  },
  async ({ execute, wId, fromWorkspaceModelId }, logger) => {
    const total = { ...EMPTY_OUTCOME };
    const failedWorkspaceIds: string[] = [];

    await runOnAllWorkspaces(
      async (workspace) => {
        try {
          const outcome = await cleanupWorkspace(workspace.sId, {
            execute,
            logger,
          });
          total.deletedSandboxes += outcome.deletedSandboxes;
          total.deletedFunctions += outcome.deletedFunctions;
          total.deletedInvocations += outcome.deletedInvocations;
          total.deletedMcpActions += outcome.deletedMcpActions;
          total.deletedFiles += outcome.deletedFiles;
        } catch (err) {
          // One workspace failing must not strand the rest: the run is resumable, so record it
          // and keep going.
          failedWorkspaceIds.push(workspace.sId);
          logger.error(
            { err: normalizeError(err), workspaceId: workspace.sId },
            "Failed to clean up pod functions and sandboxes"
          );
        }
      },
      {
        concurrency: WORKSPACE_CONCURRENCY,
        wId,
        fromWorkspaceId: fromWorkspaceModelId,
      }
    );

    logger.info({ execute, ...total, failedWorkspaceIds }, "Cleanup complete");
  }
);
