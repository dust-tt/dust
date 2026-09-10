import { deletePodStatePrefix } from "@app/lib/api/sandbox/db";
import { deleteLegacyPodOwnedSandbox } from "@app/lib/api/sandbox/legacy_pod_sandbox";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { SandboxOwnerModel } from "@app/lib/resources/storage/models/sandbox";
import { SandboxFunctionModel } from "@app/lib/resources/storage/models/sandbox_function";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { getPodSandboxFunctionsBasePath } from "@app/types/mount_path";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Op } from "sequelize";

// Scrubs everything left behind by Pod functions and pod-owned sandboxes, both of which no longer
// exist in code. Nothing creates these rows any more, so a clean run leaves the workspace with no
// `spaceId` on `sandbox_functions` or `sandbox_owners`.
//
// Per workspace, in this order:
//
//  1. Pod-owned sandboxes: destroy at the provider, then drop the `sandbox_owners` row and the
//     `sandboxes` row. First, because a running sandbox keeps replicating into the pod state
//     prefix wiped in step 3.
//  2. Pod functions: their MCP actions and invocations (rows + GCS blobs), then the function rows,
//     then the published bundle files each one owns.
//  3. The pod GCS prefixes those two leave behind: the litestream state replica and the read-only
//     published-bundle mount.
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
  deletedFiles: number;
  wipedPrefixes: number;
};

const EMPTY_OUTCOME: WorkspaceOutcome = {
  deletedSandboxes: 0,
  deletedFunctions: 0,
  deletedInvocations: 0,
  deletedFiles: 0,
  wipedPrefixes: 0,
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
 * Delete every function row scoped to `pod`, its execution history and the bundle files it owns.
 *
 * Read straight off the model rather than through `SandboxFunctionResource`, whose fetch path
 * only hydrates Frame functions now — a pod function would come back as nothing.
 */
async function deletePodFunctions(
  auth: Authenticator,
  pod: SpaceResource,
  { execute, logger }: { execute: boolean; logger: Logger }
): Promise<
  Pick<
    WorkspaceOutcome,
    "deletedFunctions" | "deletedInvocations" | "deletedFiles"
  >
> {
  const workspaceModelId = auth.getNonNullableWorkspace().id;
  const rows = await SandboxFunctionModel.findAll({
    attributes: ["id", "fileId", "slug"],
    where: { workspaceId: workspaceModelId, spaceId: pod.id },
  });
  if (rows.length === 0) {
    return { deletedFunctions: 0, deletedInvocations: 0, deletedFiles: 0 };
  }

  const sandboxFunctionModelIds = rows.map(({ id }) => id);
  if (!execute) {
    logger.info(
      { functionCount: rows.length, slugs: rows.map(({ slug }) => slug) },
      "[DRY RUN] Would delete pod functions, their invocations and their bundle files"
    );
    return { deletedFunctions: 0, deletedInvocations: 0, deletedFiles: 0 };
  }

  // MCP actions FK invocations with RESTRICT, and invocations FK functions with RESTRICT, so the
  // history goes first. This also removes the invocation and action GCS blobs.
  const deletedInvocations =
    await SandboxFunctionInvocationResource.deleteAllForSandboxFunctionModelIds(
      { workspaceModelId, sandboxFunctionModelIds }
    );

  const deletedFunctions = await SandboxFunctionModel.destroy({
    where: { id: sandboxFunctionModelIds, workspaceId: workspaceModelId },
  });

  // Each pod function owned one published bundle file, and referenced it with RESTRICT — so the
  // files can only go once the function rows are gone.
  const files = await FileResource.fetchByModelIdsWithAuth(auth, [
    ...new Set(rows.map(({ fileId }) => fileId)),
  ]);
  let deletedFiles = 0;
  for (const file of files) {
    const result = await file.delete(auth);
    if (result.isErr()) {
      throw result.error;
    }
    deletedFiles++;
  }

  logger.info(
    { deletedFunctions, deletedInvocations, deletedFiles },
    "Deleted pod functions"
  );

  return { deletedFunctions, deletedInvocations, deletedFiles };
}

/**
 * Wipe the two GCS prefixes only pod sandboxes and pod functions ever wrote: the litestream state
 * replica and the read-only published-bundle mount. Unlike the rows above these leave no trace to
 * key on, so they are wiped for every pod that had either.
 */
async function wipePodPrefixes(
  auth: Authenticator,
  pod: SpaceResource,
  { execute, logger }: { execute: boolean; logger: Logger }
): Promise<number> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const functionsPrefix = getPodSandboxFunctionsBasePath({
    workspaceId,
    podId: pod.sId,
  });

  if (!execute) {
    logger.info(
      { functionsPrefix },
      "[DRY RUN] Would wipe the pod state and sandbox-functions prefixes"
    );
    return 0;
  }

  const stateResult = await deletePodStatePrefix(auth, pod);
  if (stateResult.isErr()) {
    throw stateResult.error;
  }
  await getPrivateUploadBucket().deleteByPrefix(functionsPrefix);

  return 2;
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
      const functions = await deletePodFunctions(auth, pod, {
        execute,
        logger: podLogger,
      });
      outcome.deletedFunctions += functions.deletedFunctions;
      outcome.deletedInvocations += functions.deletedInvocations;
      outcome.deletedFiles += functions.deletedFiles;
    }

    outcome.wipedPrefixes += await wipePodPrefixes(auth, pod, {
      execute,
      logger: podLogger,
    });
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
          total.deletedFiles += outcome.deletedFiles;
          total.wipedPrefixes += outcome.wipedPrefixes;
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
