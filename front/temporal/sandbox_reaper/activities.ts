import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
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

type ConversationMaps = {
  conversationModelIdsBySandboxModelId: Map<ModelId, ModelId>;
  conversationsBySandboxModelId: Map<ModelId, ConversationResource>;
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
 * Fetch the ConversationResource for each sandbox, keyed by conversation
 * sandbox ModelId. The reaper spans every workspace, so we issue a single
 * cross-workspace query instead of one scoped query per workspace.
 */
async function fetchConversationMap(
  sandboxes: SandboxResource[]
): Promise<ConversationMaps> {
  const conversationModelIdsBySandboxModelId =
    await ConversationResource.dangerouslyFetchConversationModelIdsBySandboxes(
      sandboxes
    );
  const conversationModelIds = [
    ...new Set(conversationModelIdsBySandboxModelId.values()),
  ];
  const conversations =
    await ConversationResource.dangerouslyFetchByModelIds(conversationModelIds);
  const conversationsById = new Map(conversations.map((c) => [c.id, c]));

  return {
    conversationModelIdsBySandboxModelId,
    conversationsBySandboxModelId: new Map(
      sandboxes.flatMap((sandbox) => {
        const conversationModelId = conversationModelIdsBySandboxModelId.get(
          sandbox.id
        );
        if (!conversationModelId) {
          return [];
        }

        const conversation = conversationsById.get(conversationModelId);

        return conversation ? [[sandbox.id, conversation] as const] : [];
      })
    ),
  };
}

/**
 * Shared driver for every reaper phase: resolve the workspace auth and the
 * ConversationResource for each sandbox, then run `action` concurrently. The
 * lifecycle methods run from the conversation resource so callers do not need
 * to know the conversation-owned sandbox lookup details.
 */
async function processSandboxes(
  sandboxes: SandboxResource[],
  action: (
    auth: Authenticator,
    conversation: ConversationResource
  ) => Promise<Result<void, Error>>,
  errorMessage: string
): Promise<void> {
  const authMap = await fetchAuthMap(sandboxes);
  const conversationMaps = await fetchConversationMap(sandboxes);

  await concurrentExecutor(
    sandboxes,
    async (sandbox) => {
      const auth = authMap.get(sandbox.workspaceId);
      const conversation = conversationMaps.conversationsBySandboxModelId.get(
        sandbox.id
      );

      if (!auth || !conversation) {
        logger.warn(
          {
            ownershipConversationModelId:
              conversationMaps.conversationModelIdsBySandboxModelId.get(
                sandbox.id
              ) ?? null,
            sandboxModelId: sandbox.id,
            workspaceModelId: sandbox.workspaceId,
          },
          "Reaper: workspace or conversation not found, skipping."
        );
        return;
      }

      const result = await action(auth, conversation);
      if (result.isErr()) {
        logger.error(
          {
            conversationModelId: conversation.id,
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
      (auth, conversation) =>
        ConversationSandboxAdapter.dangerouslyDestroySandboxIfKillRequested(
          auth,
          conversation
        ),
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
      (auth, conversation) =>
        ConversationSandboxAdapter.dangerouslySleepSandboxIfRunning(
          auth,
          conversation
        ),
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
      (auth, conversation) =>
        ConversationSandboxAdapter.dangerouslySleepSandboxIfPendingApproval(
          auth,
          conversation
        ),
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
      (auth, conversation) =>
        ConversationSandboxAdapter.dangerouslyDestroySandboxIfSleeping(
          auth,
          conversation
        ),
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
