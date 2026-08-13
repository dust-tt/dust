import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { FileSystemBlobCleanupResource } from "@app/lib/resources/file_system_blob_cleanup_resource";
import { FileSystemMutationResource } from "@app/lib/resources/file_system_mutation_resource";
import { PodSandboxAdapter } from "@app/lib/resources/pod_sandbox_adapter";
import type { SandboxTimestampCursor } from "@app/lib/resources/sandbox_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { heartbeat } from "@temporalio/activity";

import {
  BATCH_SIZE,
  DESTROY_THRESHOLD_MS,
  PENDING_APPROVAL_THRESHOLD_MS,
  SLEEP_THRESHOLD_MS,
} from "./config";

const REAPER_CONCURRENCY = 16;
const FILE_SYSTEM_CLEANUP_CONCURRENCY = 4;

export async function cleanupFileSystemActivity(): Promise<void> {
  const blobWorkspaceModelIds =
    await FileSystemBlobCleanupResource.dangerouslyListWorkspaceModelIdsWithDueCleanup();
  const receiptWorkspaceModelIds =
    await FileSystemMutationResource.dangerouslyListWorkspaceModelIdsWithExpiredReceipts();
  const workspaceModelIds = [
    ...new Set([...blobWorkspaceModelIds, ...receiptWorkspaceModelIds]),
  ];
  if (workspaceModelIds.length === 0) {
    return;
  }
  const workspaces = await WorkspaceResource.fetchByModelIds(workspaceModelIds);
  await concurrentExecutor(
    workspaces,
    async (workspace) => {
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      await FileSystemBlobCleanupResource.repairPending(auth);
      await FileSystemMutationResource.cleanupCompleted(auth);
    },
    { concurrency: FILE_SYSTEM_CLEANUP_CONCURRENCY }
  );
  logger.info(
    { workspaceCount: workspaces.length },
    "Cleaned pending Dust filesystem blobs and mutation receipts."
  );
}

export type ReaperPhase =
  | "kill_requested"
  | "kill_requested_sleeping"
  | "running"
  | "pending_approval"
  | "sleeping";

export type ReaperCursor = {
  sandboxModelId: ModelId;
  timestampMs: number;
};

interface ReapSandboxPhaseActivityInput {
  cursor: ReaperCursor | null;
  phase: ReaperPhase;
}

export interface ReapSandboxPhaseActivityResult {
  failedCount: number;
  nextCursor: ReaperCursor | null;
  processedCount: number;
  skippedCount: number;
  succeededCount: number;
}

type ReaperSandboxLifecycleOwner = {
  kind: "conversation" | "pod";
  modelId: ModelId;
  workspaceModelId: ModelId;
  dangerouslyDestroySandboxIfKillRequested(
    auth: Authenticator
  ): Promise<Result<void, Error>>;
  dangerouslyDestroySandboxIfSleeping(
    auth: Authenticator
  ): Promise<Result<void, Error>>;
  dangerouslySleepSandboxIfPendingApproval(
    auth: Authenticator
  ): Promise<Result<void, Error>>;
  dangerouslySleepSandboxIfRunning(
    auth: Authenticator
  ): Promise<Result<void, Error>>;
};

type SandboxOwnerRef = {
  kind: ReaperSandboxLifecycleOwner["kind"];
  modelId: ModelId;
};

type SandboxOwnerMaps = {
  ownerRefsBySandboxModelId: Map<ModelId, SandboxOwnerRef>;
  ownersBySandboxModelId: Map<ModelId, ReaperSandboxLifecycleOwner>;
};

type ReaperAuthMaps = {
  conversation: Map<ModelId, Authenticator>;
  pod: Map<ModelId, Authenticator>;
};

/**
 * Build workspace-scoped authenticators for each owner kind touched by the
 * batch. Conversation lifecycle calls retain builder auth. Pod lifecycle calls
 * need the workspace's project groups so their pre-sleep filesystem flush can
 * access restricted projects.
 */
async function fetchAuthMaps(
  sandboxes: SandboxResource[],
  ownerMaps: SandboxOwnerMaps
): Promise<ReaperAuthMaps> {
  const workspaceModelIdsByOwnerKind = {
    conversation: new Set<ModelId>(),
    pod: new Set<ModelId>(),
  };

  for (const sandbox of sandboxes) {
    const ownerRef = ownerMaps.ownerRefsBySandboxModelId.get(sandbox.id);
    if (ownerRef) {
      workspaceModelIdsByOwnerKind[ownerRef.kind].add(sandbox.workspaceId);
    }
  }

  const uniqueWorkspaceModelIds = [
    ...new Set([
      ...workspaceModelIdsByOwnerKind.conversation,
      ...workspaceModelIdsByOwnerKind.pod,
    ]),
  ];

  const workspaces = await WorkspaceResource.fetchByModelIds(
    uniqueWorkspaceModelIds
  );

  const [conversationEntries, podEntries] = await Promise.all([
    concurrentExecutor(
      workspaces.filter((workspace) =>
        workspaceModelIdsByOwnerKind.conversation.has(workspace.id)
      ),
      async (workspace) => {
        const authenticator = await Authenticator.internalBuilderForWorkspace(
          workspace.sId
        );
        return [workspace.id, authenticator] as const;
      },
      { concurrency: REAPER_CONCURRENCY }
    ),
    concurrentExecutor(
      workspaces.filter((workspace) =>
        workspaceModelIdsByOwnerKind.pod.has(workspace.id)
      ),
      async (workspace) => {
        const authenticator = await Authenticator.internalAdminForWorkspace(
          workspace.sId,
          {
            dangerouslyRequestAllGroups: true,
          }
        );
        return [workspace.id, authenticator] as const;
      },
      { concurrency: REAPER_CONCURRENCY }
    ),
  ]);

  return {
    conversation: new Map(conversationEntries),
    pod: new Map(podEntries),
  };
}

/**
 * Fetch the owner adapter for each sandbox. The reaper spans every workspace,
 * so it resolves owner ids through join tables first, then issues one
 * cross-workspace query per owner kind.
 */
async function fetchSandboxOwnerMaps(
  sandboxes: SandboxResource[]
): Promise<SandboxOwnerMaps> {
  const conversationModelIdsBySandboxModelId =
    await ConversationSandboxAdapter.dangerouslyFetchConversationModelIdsBySandboxes(
      sandboxes
    );
  const podModelIdsBySandboxModelId =
    await PodSandboxAdapter.dangerouslyFetchPodModelIdsBySandboxes(sandboxes);

  const conversationModelIds = [
    ...new Set(conversationModelIdsBySandboxModelId.values()),
  ];
  const podModelIds = [...new Set(podModelIdsBySandboxModelId.values())];

  const conversations =
    await ConversationResource.dangerouslyFetchByModelIds(conversationModelIds);
  const pods = await SpaceResource.dangerouslyFetchByModelIds(podModelIds);

  const conversationsById = new Map(conversations.map((c) => [c.id, c]));
  const podsById = new Map(
    pods.filter((p) => p.isProject()).map((p) => [p.id, p])
  );

  const ownerRefsBySandboxModelId = new Map<ModelId, SandboxOwnerRef>();
  const ownersBySandboxModelId = new Map<
    ModelId,
    ReaperSandboxLifecycleOwner
  >();

  for (const sandbox of sandboxes) {
    const conversationModelId = conversationModelIdsBySandboxModelId.get(
      sandbox.id
    );
    if (conversationModelId) {
      ownerRefsBySandboxModelId.set(sandbox.id, {
        kind: "conversation",
        modelId: conversationModelId,
      });

      const conversation = conversationsById.get(conversationModelId);
      if (conversation) {
        ownersBySandboxModelId.set(sandbox.id, {
          kind: "conversation",
          modelId: conversation.id,
          workspaceModelId: conversation.workspaceId,
          dangerouslyDestroySandboxIfKillRequested: (auth) =>
            ConversationSandboxAdapter.dangerouslyDestroySandboxIfKillRequested(
              auth,
              conversation
            ),
          dangerouslyDestroySandboxIfSleeping: (auth) =>
            ConversationSandboxAdapter.dangerouslyDestroySandboxIfSleeping(
              auth,
              conversation
            ),
          dangerouslySleepSandboxIfPendingApproval: (auth) =>
            ConversationSandboxAdapter.dangerouslySleepSandboxIfPendingApproval(
              auth,
              conversation
            ),
          dangerouslySleepSandboxIfRunning: (auth) =>
            ConversationSandboxAdapter.dangerouslySleepSandboxIfRunning(
              auth,
              conversation
            ),
        });
      }
      continue;
    }

    const podModelId = podModelIdsBySandboxModelId.get(sandbox.id);
    if (!podModelId) {
      continue;
    }

    ownerRefsBySandboxModelId.set(sandbox.id, {
      kind: "pod",
      modelId: podModelId,
    });

    const pod = podsById.get(podModelId);
    if (pod) {
      ownersBySandboxModelId.set(sandbox.id, {
        kind: "pod",
        modelId: pod.id,
        workspaceModelId: pod.workspaceId,
        dangerouslyDestroySandboxIfKillRequested: (auth) =>
          PodSandboxAdapter.dangerouslyDestroySandboxIfKillRequested(auth, pod),
        dangerouslyDestroySandboxIfSleeping: (auth) =>
          PodSandboxAdapter.dangerouslyDestroySandboxIfSleeping(auth, pod),
        dangerouslySleepSandboxIfPendingApproval: (auth) =>
          PodSandboxAdapter.dangerouslySleepSandboxIfPendingApproval(auth, pod),
        dangerouslySleepSandboxIfRunning: (auth) =>
          PodSandboxAdapter.dangerouslySleepSandboxIfRunning(auth, pod),
      });
    }
  }

  return { ownerRefsBySandboxModelId, ownersBySandboxModelId };
}

/**
 * Shared driver for every reaper phase: resolve the workspace auth and the
 * owner adapter for each sandbox, then run `action` concurrently. The
 * lifecycle methods run from the owner adapter so callers do not need to know
 * the sandbox lookup details.
 */
type ProcessSandboxOutcome = "succeeded" | "failed" | "skipped";

interface ProcessSandboxesResult {
  failedCount: number;
  skippedCount: number;
  succeededCount: number;
}

async function processSandboxes(
  sandboxes: SandboxResource[],
  action: (
    auth: Authenticator,
    owner: ReaperSandboxLifecycleOwner
  ) => Promise<Result<void, Error>>,
  errorMessage: string
): Promise<ProcessSandboxesResult> {
  const ownerMaps = await fetchSandboxOwnerMaps(sandboxes);
  const authMaps = await fetchAuthMaps(sandboxes, ownerMaps);

  const outcomes = await concurrentExecutor(
    sandboxes,
    async (sandbox): Promise<ProcessSandboxOutcome> => {
      const owner = ownerMaps.ownersBySandboxModelId.get(sandbox.id);
      const auth = owner
        ? authMaps[owner.kind].get(sandbox.workspaceId)
        : undefined;

      if (!auth || !owner) {
        const ownerRef = ownerMaps.ownerRefsBySandboxModelId.get(sandbox.id);
        logger.warn(
          {
            ownerKind: ownerRef?.kind ?? null,
            ownerModelId: ownerRef?.modelId ?? null,
            sandboxModelId: sandbox.id,
            workspaceModelId: sandbox.workspaceId,
          },
          "Reaper: workspace or sandbox owner not found, skipping."
        );
        heartbeat();
        return "skipped";
      }

      if (owner.workspaceModelId !== sandbox.workspaceId) {
        logger.error(
          {
            ownerKind: owner.kind,
            ownerModelId: owner.modelId,
            ownerWorkspaceModelId: owner.workspaceModelId,
            sandboxModelId: sandbox.id,
            sandboxWorkspaceModelId: sandbox.workspaceId,
          },
          "Reaper: sandbox owner workspace mismatch, skipping."
        );
        heartbeat();
        return "failed";
      }

      const result = await action(auth, owner);
      if (result.isErr()) {
        logger.error(
          {
            ownerKind: owner.kind,
            ownerModelId: owner.modelId,
            sandboxModelId: sandbox.id,
            workspaceModelId: sandbox.workspaceId,
            error: result.error.message,
          },
          errorMessage
        );
        heartbeat();
        return "failed";
      }

      heartbeat();
      return "succeeded";
    },
    { concurrency: REAPER_CONCURRENCY }
  );

  let failedCount = 0;
  let skippedCount = 0;
  let succeededCount = 0;

  for (const outcome of outcomes) {
    switch (outcome) {
      case "failed":
        failedCount += 1;
        break;
      case "skipped":
        skippedCount += 1;
        break;
      case "succeeded":
        succeededCount += 1;
        break;
      default:
        assertNever(outcome);
    }
  }

  return { failedCount, skippedCount, succeededCount };
}

function toResourceCursor(
  cursor: ReaperCursor | null
): SandboxTimestampCursor | undefined {
  if (!cursor) {
    return undefined;
  }
  return {
    sandboxModelId: cursor.sandboxModelId,
    timestamp: new Date(cursor.timestampMs),
  };
}

function getKillRequestedAt(sandbox: SandboxResource): Date {
  if (!sandbox.killRequestedAt) {
    throw new Error(
      `Kill-requested sandbox ${sandbox.sId} has no killRequestedAt.`
    );
  }
  return sandbox.killRequestedAt;
}

function makeNextCursor(
  sandboxes: SandboxResource[],
  getTimestamp: (sandbox: SandboxResource) => Date
): ReaperCursor | null {
  if (sandboxes.length < BATCH_SIZE) {
    return null;
  }

  const lastSandbox = sandboxes.at(-1);
  if (!lastSandbox) {
    return null;
  }

  return {
    sandboxModelId: lastSandbox.id,
    timestampMs: getTimestamp(lastSandbox).getTime(),
  };
}

async function processReaperBatch(
  phase: ReaperPhase,
  sandboxes: SandboxResource[],
  action: (
    auth: Authenticator,
    owner: ReaperSandboxLifecycleOwner
  ) => Promise<Result<void, Error>>,
  getTimestamp: (sandbox: SandboxResource) => Date,
  errorMessage: string
): Promise<ReapSandboxPhaseActivityResult> {
  if (sandboxes.length === 0) {
    return {
      failedCount: 0,
      nextCursor: null,
      processedCount: 0,
      skippedCount: 0,
      succeededCount: 0,
    };
  }

  logger.info(
    { count: sandboxes.length, phase },
    "Reaper: sandbox batch found."
  );

  const result = await processSandboxes(sandboxes, action, errorMessage);

  logger.info(
    {
      phase,
      processedCount: sandboxes.length,
      ...result,
    },
    "Reaper: sandbox batch processed."
  );

  return {
    ...result,
    nextCursor: makeNextCursor(sandboxes, getTimestamp),
    processedCount: sandboxes.length,
  };
}

/**
 * Process one ordered batch for one reaper phase. The cursor advances past
 * failed rows as well as successful rows so a permanently failing oldest batch
 * cannot spin within one workflow run or starve newer candidates. A new
 * scheduled workflow starts without a cursor and retries failures.
 */
export async function reapSandboxPhaseActivity({
  cursor,
  phase,
}: ReapSandboxPhaseActivityInput): Promise<ReapSandboxPhaseActivityResult> {
  const after = toResourceCursor(cursor);

  switch (phase) {
    case "kill_requested": {
      // Awake kill-requested sandboxes consume cluster capacity, so they are
      // destroyed ahead of sleeping ones.
      const sandboxes =
        await SandboxResource.dangerouslyGetKillRequestedSandboxes({
          limit: BATCH_SIZE,
          after,
          statuses: ["running", "pending_approval"],
        });
      return processReaperBatch(
        phase,
        sandboxes,
        (auth, owner) => owner.dangerouslyDestroySandboxIfKillRequested(auth),
        getKillRequestedAt,
        "Reaper: failed to destroy kill-requested sandbox — continuing."
      );
    }
    case "kill_requested_sleeping": {
      // Sleeping kill-requested sandboxes free no concurrency (already
      // paused) and were flushed at pause time — runPreSleepCheck no-ops
      // here. Destroying them in the reaper still helps: ensureActive would
      // otherwise pay the provider destroy on the user's recreate path.
      //
      // Most recently active first: those are the most likely to be woken by
      // a returning user, so the background destroy lands before they hit
      // ensureActive.
      const sandboxes =
        await SandboxResource.dangerouslyGetKillRequestedSandboxes({
          limit: BATCH_SIZE,
          after,
          statuses: ["sleeping"],
          order: "lastActivityAtDesc",
        });
      return processReaperBatch(
        phase,
        sandboxes,
        (auth, owner) => owner.dangerouslyDestroySandboxIfKillRequested(auth),
        (sandbox) => sandbox.lastActivityAt,
        "Reaper: failed to destroy kill-requested sleeping sandbox — continuing."
      );
    }
    case "running": {
      const sandboxes = await SandboxResource.dangerouslyGetStaleSandboxes({
        status: "running",
        olderThanMs: SLEEP_THRESHOLD_MS,
        limit: BATCH_SIZE,
        after,
      });
      return processReaperBatch(
        phase,
        sandboxes,
        (auth, owner) => owner.dangerouslySleepSandboxIfRunning(auth),
        (sandbox) => sandbox.lastActivityAt,
        "Reaper: failed to sleep sandbox — continuing."
      );
    }
    case "pending_approval": {
      const sandboxes = await SandboxResource.dangerouslyGetStaleSandboxes({
        status: "pending_approval",
        olderThanMs: PENDING_APPROVAL_THRESHOLD_MS,
        limit: BATCH_SIZE,
        after,
      });
      return processReaperBatch(
        phase,
        sandboxes,
        (auth, owner) => owner.dangerouslySleepSandboxIfPendingApproval(auth),
        (sandbox) => sandbox.lastActivityAt,
        "Reaper: failed to transition pending_approval sandbox — continuing."
      );
    }
    case "sleeping": {
      const sandboxes = await SandboxResource.dangerouslyGetStaleSandboxes({
        status: "sleeping",
        olderThanMs: DESTROY_THRESHOLD_MS,
        limit: BATCH_SIZE,
        after,
      });
      return processReaperBatch(
        phase,
        sandboxes,
        (auth, owner) => owner.dangerouslyDestroySandboxIfSleeping(auth),
        (sandbox) => sandbox.lastActivityAt,
        "Reaper: failed to destroy sandbox — continuing."
      );
    }
    default:
      return assertNever(phase);
  }
}
