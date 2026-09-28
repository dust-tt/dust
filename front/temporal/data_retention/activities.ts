import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import type { StaleFramePublicationPurgeResult } from "@app/lib/api/frames/publication_retention";
import { purgeStaleFramePublications } from "@app/lib/api/frames/publication_retention";
import { Authenticator } from "@app/lib/auth";
import { AgentDataRetentionModel } from "@app/lib/models/agent/agent_data_retention";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import {
  FRAME_FUNCTION_INVOCATION_BATCH_SIZE,
  FRAME_FUNCTION_INVOCATION_RETENTION_MS,
  FRAME_PUBLICATION_BATCH_SIZE,
} from "@app/temporal/data_retention/config";
import type { ModelId } from "@app/types/shared/model_id";
import { heartbeat } from "@temporalio/activity";
import assert from "assert";
import sumBy from "lodash/sumBy";

const WORKSPACE_CONVERSATIONS_BATCH_SIZE = 200;
const HEARTBEAT_RATE = 100;

/**
 * Get workspace ids with conversations retention policy.
 */
export async function getWorkspacesWithConversationsRetentionActivity(): Promise<
  ModelId[]
> {
  return WorkspaceResource.listModelIdsWithConversationsRetention();
}

/**
 * Purge conversations for workspaces with retention policy.
 * We chunk the workspaces to avoid hitting the database with too many queries at once.
 */
type PurgeConversationsBatchActivityReturnType = {
  workspaceModelId: ModelId;
  workspaceId: string;
  nbConversationsDeleted: number;
};

export async function purgeConversationsBatchActivity({
  workspaceIds,
}: {
  workspaceIds: ModelId[];
}): Promise<PurgeConversationsBatchActivityReturnType[]> {
  const res: PurgeConversationsBatchActivityReturnType[] = [];
  const workspaces = await WorkspaceResource.fetchByModelIds([
    ...new Set(workspaceIds),
  ]);
  const workspaceByModelId = new Map(
    workspaces.map((workspace) => [workspace.id, workspace])
  );

  for (const workspaceId of workspaceIds) {
    const workspace = workspaceByModelId.get(workspaceId);
    if (!workspace) {
      logger.error(
        { workspaceId },
        "Workspace with retention policy not found."
      );
      continue;
    }
    if (!workspace.conversationsRetentionDays) {
      logger.error(
        { workspaceId },
        "Workspace with retention policy has no retention days."
      );
      continue;
    }
    const retentionDays = workspace.conversationsRetentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const conversations = await ConversationResource.listAllBeforeDate(
      auth,
      cutoffDate,
      {
        batchSize: WORKSPACE_CONVERSATIONS_BATCH_SIZE,
        // Retention is internal maintenance, so selection must ignore end-user space visibility.
        dangerouslySkipPermissionFiltering: true,
        includeDeleted: true,
      }
    );

    logger.info(
      {
        workspaceId,
        retentionDays,
        cutoffDate,
        nbConversations: conversations.length,
      },
      "Purging conversations for workspace."
    );
    heartbeat();

    let deletedCount = 0;
    await concurrentExecutor(
      conversations,
      async (conversation) => {
        const result = await destroyConversation(auth, { conversation });
        if (result.isErr()) {
          throw result.error;
        }
        deletedCount++;
        if (deletedCount % HEARTBEAT_RATE === 0) {
          heartbeat();
        }
      },
      {
        concurrency: 2,
      }
    );
    heartbeat();

    res.push({
      workspaceModelId: workspace.id,
      workspaceId: workspace.sId,
      nbConversationsDeleted: conversations.length,
    });
  }

  return res;
}

/**
 * Get agent configurations with conversations retention policy.
 */
export async function getAgentsWithConversationsRetentionActivity(): Promise<
  {
    agentConfigurationId: string;
    workspaceId: ModelId;
    retentionDays: number;
  }[]
> {
  const agentRetentions = await AgentDataRetentionModel.findAll();
  return agentRetentions.map((a) => ({
    agentConfigurationId: a.agentConfigurationId,
    workspaceId: a.workspaceId,
    retentionDays: a.retentionDays,
  }));
}

/**
 * Purge conversations for an agent.
 * We chunk the conversations to avoid hitting the database with too many queries at once.
 */
export async function purgeAgentConversationsBatchActivity({
  agentConfigurationId,
  workspaceId,
  retentionDays,
}: {
  agentConfigurationId: string;
  workspaceId: ModelId;
  retentionDays: number;
}): Promise<{
  agentConfigurationId: string;
  workspaceModelId: ModelId;
  workspaceId: string;
  retentionDays: number;
  nbConversationsDeleted: number;
}> {
  const workspace = await WorkspaceResource.fetchByModelId(workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found");
  }
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const conversations =
    await ConversationResource.listConversationWithAgentCreatedBeforeDate(
      auth,
      {
        agentConfigurationId,
        cutoffDate,
      },
      {
        // Retention is internal maintenance, so selection must ignore end-user space visibility.
        dangerouslySkipPermissionFiltering: true,
        includeDeleted: true,
      }
    );

  await concurrentExecutor(
    conversations,
    async (conversation) => {
      const result = await destroyConversation(auth, { conversation });
      if (result.isErr()) {
        throw result.error;
      }
    },
    {
      concurrency: 2,
    }
  );

  return {
    agentConfigurationId,
    workspaceModelId: workspace.id,
    workspaceId: workspace.sId,
    retentionDays,
    nbConversationsDeleted: conversations.length,
  };
}

export type PurgeExpiredFrameFunctionInvocationsActivityResult = {
  deletedInvocationCount: number;
  deletedMCPActionCount: number;
  nextAfterModelId: ModelId | null;
  scannedCount: number;
};

/**
 * Delete one batch of Frame function invocations past the retention window, resuming after
 * `afterModelId`. A null `nextAfterModelId` in the result means the sweep has nothing left to do.
 */
export async function purgeExpiredFrameFunctionInvocationsActivity({
  afterModelId,
}: {
  afterModelId: ModelId | null;
}): Promise<PurgeExpiredFrameFunctionInvocationsActivityResult> {
  const cutoffDate = new Date(
    Date.now() - FRAME_FUNCTION_INVOCATION_RETENTION_MS
  );

  const result =
    await SandboxFunctionInvocationResource.dangerouslyDeleteExpiredBatch({
      afterModelId,
      batchSize: FRAME_FUNCTION_INVOCATION_BATCH_SIZE,
      cutoffDate,
    });

  logger.info(
    {
      afterModelId,
      cutoffDate: cutoffDate.toISOString(),
      deletedInvocationCount: result.deletedInvocationCount,
      deletedMCPActionCount: result.deletedMCPActionCount,
      hasMore: result.nextAfterModelId !== null,
      scannedCount: result.scannedCount,
    },
    "[Frames Retention] Purged a batch of expired Frame function invocations."
  );

  return result;
}

export type PurgeStaleFramePublicationsActivityResult =
  StaleFramePublicationPurgeResult & {
    nextAfterModelId: ModelId | null;
    scannedFrameCount: number;
  };

const FRAME_PUBLICATION_FRAME_CONCURRENCY = 4;

/**
 * Purge the superseded publications of one batch of Frames, resuming after `afterModelId`. A null
 * `nextAfterModelId` in the result means every Frame has been swept.
 */
export async function purgeStaleFramePublicationsActivity({
  afterModelId,
}: {
  afterModelId: ModelId | null;
}): Promise<PurgeStaleFramePublicationsActivityResult> {
  const frames = await FileResource.dangerouslyListFrameV2Batch({
    afterModelId,
    batchSize: FRAME_PUBLICATION_BATCH_SIZE,
  });

  // One admin authenticator per workspace, not per frame: building one costs several queries.
  const workspaces = await WorkspaceResource.fetchByModelIds([
    ...new Set(frames.map((frame) => frame.workspaceId)),
  ]);
  const authByWorkspaceModelId = new Map(
    await Promise.all(
      workspaces.map(
        async (workspace) =>
          [
            workspace.id,
            await Authenticator.internalAdminForWorkspace(workspace.sId),
          ] as const
      )
    )
  );

  const results = await concurrentExecutor(
    frames,
    async (frame) => {
      const auth = authByWorkspaceModelId.get(frame.workspaceId);
      assert(auth, "A Frame's workspace must exist.");

      const result = await purgeStaleFramePublications(auth, {
        frame,
        retentionMs: FRAME_FUNCTION_INVOCATION_RETENTION_MS,
      });
      heartbeat();

      return result;
    },
    { concurrency: FRAME_PUBLICATION_FRAME_CONCURRENCY }
  );

  const result: PurgeStaleFramePublicationsActivityResult = {
    deletedFunctionCount: sumBy(results, "deletedFunctionCount"),
    deletedPublicationCount: sumBy(results, "deletedPublicationCount"),
    nextAfterModelId:
      frames.length < FRAME_PUBLICATION_BATCH_SIZE
        ? null
        : frames[frames.length - 1].id,
    scannedFrameCount: frames.length,
  };

  logger.info(
    {
      afterModelId,
      deletedFunctionCount: result.deletedFunctionCount,
      deletedPublicationCount: result.deletedPublicationCount,
      hasMore: result.nextAfterModelId !== null,
      scannedFrameCount: result.scannedFrameCount,
    },
    "[Frames Retention] Swept a batch of Frames for superseded publications."
  );

  return result;
}
