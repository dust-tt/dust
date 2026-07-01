import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { PodSandboxAdapter } from "@app/lib/resources/pod_sandbox_adapter";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { heartbeat } from "@temporalio/activity";

import {
  BATCH_SIZE,
  DESTROY_THRESHOLD_MS,
  PENDING_APPROVAL_THRESHOLD_MS,
  SLEEP_THRESHOLD_MS,
} from "./config";

const REAPER_CONCURRENCY = 16;

type ReaperSandboxLifecycleOwner = {
  kind: "conversation" | "pod";
  modelId: ModelId;
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

/**
 * Build a workspace-scoped internal Authenticator for each workspace touched by
 * the batch. One query for all workspaces, then one builder per workspace.
 */
async function fetchAuthMap(
  sandboxes: SandboxResource[]
): Promise<Map<ModelId, Authenticator>> {
  const uniqueWorkspaceModelIds = [
    ...new Set(sandboxes.map((s) => s.workspaceId)),
  ];

  const workspaces = await WorkspaceResource.fetchByModelIds(
    uniqueWorkspaceModelIds
  );

  const entries = await concurrentExecutor(
    workspaces,
    async (w) => {
      const authenticator = await Authenticator.internalBuilderForWorkspace(
        w.sId
      );
      return [w.id, authenticator] as const;
    },
    { concurrency: REAPER_CONCURRENCY }
  );

  return new Map(entries);
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
async function processSandboxes(
  sandboxes: SandboxResource[],
  action: (
    auth: Authenticator,
    owner: ReaperSandboxLifecycleOwner
  ) => Promise<Result<void, Error>>,
  errorMessage: string
): Promise<void> {
  const authMap = await fetchAuthMap(sandboxes);
  const ownerMaps = await fetchSandboxOwnerMaps(sandboxes);

  await concurrentExecutor(
    sandboxes,
    async (sandbox) => {
      const auth = authMap.get(sandbox.workspaceId);
      const owner = ownerMaps.ownersBySandboxModelId.get(sandbox.id);

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
        return;
      }

      const result = await action(auth, owner);
      if (result.isErr()) {
        logger.error(
          {
            ownerKind: owner.kind,
            ownerModelId: owner.modelId,
            error: result.error.message,
          },
          errorMessage
        );
      }
      heartbeat();
    },
    { concurrency: REAPER_CONCURRENCY }
  );
}

/**
 * Process one batch of stale sandboxes. Returns `true` when any query returned a
 * full batch, signalling the workflow to loop for more.
 */
export async function reapStaleSandboxesActivity(): Promise<boolean> {
  // Phase 0: Destroy sandboxes flagged with killRequestedAt. These bypass the
  // sleep→destroy cycle and are reaped immediately regardless of status/age.
  const killRequestedSandboxes =
    await SandboxResource.dangerouslyGetKillRequestedSandboxes({
      limit: BATCH_SIZE,
    });

  if (killRequestedSandboxes.length > 0) {
    logger.info(
      { count: killRequestedSandboxes.length },
      "Reaper: kill-requested sandboxes found."
    );

    await processSandboxes(
      killRequestedSandboxes,
      (auth, owner) => owner.dangerouslyDestroySandboxIfKillRequested(auth),
      "Reaper: failed to destroy kill-requested sandbox — continuing."
    );
  }

  // Phase 1: Sleep running sandboxes that have been idle > SLEEP_THRESHOLD_MS.
  const runningSandboxes = await SandboxResource.dangerouslyGetStaleSandboxes({
    status: "running",
    olderThanMs: SLEEP_THRESHOLD_MS,
    limit: BATCH_SIZE,
  });

  if (runningSandboxes.length > 0) {
    logger.info(
      { count: runningSandboxes.length },
      "Reaper: stale running sandboxes found."
    );

    await processSandboxes(
      runningSandboxes,
      (auth, owner) => owner.dangerouslySleepSandboxIfRunning(auth),
      "Reaper: failed to sleep sandbox — continuing."
    );
  }

  // Phase 2: Transition abandoned pending_approval sandboxes to sleeping.
  const pendingSandboxes = await SandboxResource.dangerouslyGetStaleSandboxes({
    status: "pending_approval",
    olderThanMs: PENDING_APPROVAL_THRESHOLD_MS,
    limit: BATCH_SIZE,
  });

  if (pendingSandboxes.length > 0) {
    logger.info(
      { count: pendingSandboxes.length },
      "Reaper: stale pending_approval sandboxes found."
    );

    await processSandboxes(
      pendingSandboxes,
      (auth, owner) => owner.dangerouslySleepSandboxIfPendingApproval(auth),
      "Reaper: failed to transition pending_approval sandbox — continuing."
    );
  }

  // Phase 3: Destroy sleeping sandboxes that have been idle > DESTROY_THRESHOLD_MS.
  const sleepingSandboxes = await SandboxResource.dangerouslyGetStaleSandboxes({
    status: "sleeping",
    olderThanMs: DESTROY_THRESHOLD_MS,
    limit: BATCH_SIZE,
  });

  if (sleepingSandboxes.length > 0) {
    logger.info(
      { count: sleepingSandboxes.length },
      "Reaper: stale sleeping sandboxes found."
    );

    await processSandboxes(
      sleepingSandboxes,
      (auth, owner) => owner.dangerouslyDestroySandboxIfSleeping(auth),
      "Reaper: failed to destroy sandbox — continuing."
    );
  }

  return (
    killRequestedSandboxes.length >= BATCH_SIZE ||
    runningSandboxes.length >= BATCH_SIZE ||
    pendingSandboxes.length >= BATCH_SIZE ||
    sleepingSandboxes.length >= BATCH_SIZE
  );
}
