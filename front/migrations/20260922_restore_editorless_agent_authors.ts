import {
  buildAuditLogTarget,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor, withRetry } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";
import type { Transaction } from "sequelize";
import { QueryTypes } from "sequelize";

const BATCH_SIZE = 100;
const CONCURRENCY = 4;

type EditorlessAgent = {
  agentModelId: ModelId;
  agentId: string;
  agentName: string;
  agentScope: AgentConfigurationScope;
  authorModelId: ModelId;
  authorId: string;
  workspaceModelId: ModelId;
  workspaceId: string;
};

export type RestoreEditorlessAuthorsStats = {
  editorlessAgentsFound: number;
  authorsRestored: number;
  agentsSkipped: number;
};

// The stable identity drives this keyset scan. Its primary key serves pagination, the unique
// (agentId, version) index resolves the current configuration, and the group-permission and
// membership indexes serve the two access checks.
const ELIGIBLE_AGENTS_SQL = `
  SELECT
    agent.id AS "agentModelId",
    agent."sId" AS "agentId",
    configuration.name AS "agentName",
    configuration.scope AS "agentScope",
    configuration."authorId" AS "authorModelId",
    author."sId" AS "authorId",
    workspace.id AS "workspaceModelId",
    workspace."sId" AS "workspaceId"
  FROM agents AS agent
  JOIN agent_configurations AS configuration
    ON configuration."agentId" = agent.id
   AND configuration.version = agent."currentVersion"
  JOIN users AS author ON author.id = configuration."authorId"
  JOIN workspaces AS workspace ON workspace.id = agent."workspaceId"
  WHERE configuration.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM memberships AS author_membership
      WHERE author_membership."workspaceId" = agent."workspaceId"
        AND author_membership."userId" = configuration."authorId"
        AND author_membership."startAt" <= :now
        AND (
          author_membership."endAt" IS NULL
          OR author_membership."endAt" >= :now
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM group_permissions AS permission
      JOIN groups AS permission_group
        ON permission_group."workspaceId" = permission."workspaceId"
       AND permission_group.id = permission."groupId"
      WHERE permission."workspaceId" = agent."workspaceId"
        AND permission."resourceType" = 'agent'
        AND permission."resourceId" = agent.id
        AND permission."grantType" = 'editor'
        AND (
          permission_group.kind = 'global'
          OR EXISTS (
            SELECT 1
            FROM group_memberships AS group_membership
            JOIN memberships AS editor_membership
              ON editor_membership."workspaceId" = group_membership."workspaceId"
             AND editor_membership."userId" = group_membership."userId"
             AND editor_membership."startAt" <= :now
             AND (
               editor_membership."endAt" IS NULL
               OR editor_membership."endAt" >= :now
             )
            WHERE group_membership."workspaceId" = permission."workspaceId"
              AND group_membership."groupId" = permission."groupId"
              AND group_membership.status = 'active'
              AND group_membership."startAt" <= :now
              AND (
                group_membership."endAt" IS NULL
                OR group_membership."endAt" > :now
              )
          )
        )
    )
`;

async function fetchEditorlessAgents({
  afterAgentId,
  wId,
  limit,
}: {
  afterAgentId: ModelId;
  wId?: string;
  limit: number;
}): Promise<EditorlessAgent[]> {
  // This intentionally crosses workspace boundaries to discover the small set the migration must
  // process. Every mutation below is scoped through a workspace authenticator and model ID.
  return frontSequelize.query<EditorlessAgent>(
    `${ELIGIBLE_AGENTS_SQL}
     AND agent.id > :afterAgentId
     AND (:wId IS NULL OR workspace."sId" = :wId)
     ORDER BY agent.id
     LIMIT :limit`,
    {
      replacements: { afterAgentId, wId: wId ?? null, limit, now: new Date() },
      type: QueryTypes.SELECT,
    }
  );
}

async function recheckEditorlessAgent(
  agent: EditorlessAgent,
  transaction: Transaction
): Promise<EditorlessAgent | null> {
  const rows = await frontSequelize.query<EditorlessAgent>(
    `${ELIGIBLE_AGENTS_SQL}
     AND agent.id = :agentModelId
     AND agent."workspaceId" = :workspaceModelId`,
    {
      replacements: {
        agentModelId: agent.agentModelId,
        workspaceModelId: agent.workspaceModelId,
        now: new Date(),
      },
      type: QueryTypes.SELECT,
      transaction,
    }
  );
  assert(rows.length <= 1);
  return rows[0] ?? null;
}

async function restoreAuthor(
  auth: Authenticator,
  agent: EditorlessAgent,
  logger: Logger
): Promise<EditorlessAgent | null> {
  const restored = await withTransaction(async (transaction) => {
    // This is the same lock as GroupPermissionResource's live grant mutations. Rechecking after it
    // prevents the backfill from adding the author when an admin has already added another editor.
    const key = `group_permissions:${agent.workspaceModelId}:agent:${agent.agentModelId}:editor`;
    await frontSequelize.query("SELECT pg_advisory_xact_lock(hashtext(:key))", {
      replacements: { key },
      transaction,
    });

    const current = await recheckEditorlessAgent(agent, transaction);
    if (!current) {
      return null;
    }

    const [author] = await UserResource.fetchByModelIds(
      [current.authorModelId],
      { transaction }
    );
    assert(author?.sId === current.authorId, "Current agent author not found.");

    const grantResult = await GroupPermissionResource.grantToUser(auth, {
      user: author.toJSON(),
      grantType: "editor",
      resourceType: "agent",
      resourceId: current.agentModelId,
      transaction,
    });
    if (grantResult.isErr()) {
      throw grantResult.error;
    }

    return current;
  });

  if (restored) {
    const workspace = auth.getNonNullableWorkspace();
    // Unlike the long-running app, makeScript exits the process as soon as its worker returns. Wait
    // for this post-commit attempt so the process cannot terminate it partway through. The audit
    // helper catches its own errors, so a WorkOS failure cannot fail or roll back the repair.
    await emitAuditLogEventDirect({
      workspace,
      action: "agent.editors_updated",
      actor: {
        type: "system",
        id: "restore_editorless_agent_authors",
        name: "Restore editorless agent authors",
      },
      targets: [
        buildAuditLogTarget("workspace", workspace),
        buildAuditLogTarget("agent", {
          sId: restored.agentId,
          name: restored.agentName,
        }),
      ],
      context: { location: "internal" },
      metadata: {
        agent_name: restored.agentName,
        scope: restored.agentScope,
        added_editor_ids: restored.authorId,
        removed_editor_ids: "",
        actor_added_self: "false",
      },
    });

    // Keep indexing outside the write transaction so a Temporal connection failure cannot skip the
    // audit event after the repair has committed. Retry connection failures, then log and continue.
    const indexation = await withRetry(() =>
      AgentResource.launchSearchIndexation(auth, [restored.agentId])
    );
    if (indexation.isErr()) {
      logger.error(
        {
          error: indexation.error,
          workspaceId: restored.workspaceId,
          agentId: restored.agentId,
        },
        "Failed to refresh repaired agent in search"
      );
    }
  }

  return restored;
}

/**
 * @cc [owner:philipperolet,label:migration;security] restore-eligible-agent-authors-only
 * A repair MUST grant editor access only to the current author of an active current agent when the
 * author has an active workspace membership and no active editor or workspace-global editor grant
 * exists.
 */
/**
 * @cc [owner:philipperolet,label:migration] editorless-author-repair-dry-run
 * A dry run MUST NOT write data or emit an editor-update audit event.
 */
/**
 * @cc [owner:philipperolet,label:migration;security] concurrent-editor-repair-safety
 * Each repair MUST acquire the live editor-grant lock and recheck eligibility before granting the
 * author. Before the script returns, every committed grant MUST complete an
 * `agent.editors_updated` emission attempt. Reruns MUST not add another grant.
 */
/**
 * @cc [owner:philipperolet,label:migration] repaired-agent-search-refresh
 * Every committed repair MUST attempt to refresh the agent in search after the audit attempt.
 * Exhausted search retries MUST be logged without preventing the remaining repairs.
 */
export async function restoreEditorlessAgentAuthors({
  execute,
  logger,
  wId,
  afterAgentId = 0,
  batchSize = BATCH_SIZE,
}: {
  execute: boolean;
  logger: Logger;
  wId?: string;
  afterAgentId?: ModelId;
  batchSize?: number;
}): Promise<RestoreEditorlessAuthorsStats> {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("batchSize must be a positive integer");
  }
  if (wId && !(await WorkspaceResource.fetchById(wId))) {
    throw new Error(`Workspace not found: ${wId}`);
  }

  let cursor = afterAgentId;
  const stats: RestoreEditorlessAuthorsStats = {
    editorlessAgentsFound: 0,
    authorsRestored: 0,
    agentsSkipped: 0,
  };

  for (;;) {
    const agents = await fetchEditorlessAgents({
      afterAgentId: cursor,
      wId,
      limit: batchSize,
    });
    if (agents.length === 0) {
      break;
    }

    stats.editorlessAgentsFound += agents.length;
    if (!execute) {
      for (const agent of agents) {
        logger.info(
          {
            workspaceId: agent.workspaceId,
            agentId: agent.agentId,
            agentModelId: agent.agentModelId,
            authorId: agent.authorId,
          },
          "Dry run: would restore author as agent editor"
        );
      }
    } else {
      const workspaceIds = [
        ...new Set(agents.map((agent) => agent.workspaceId)),
      ];
      const auths = await concurrentExecutor(
        workspaceIds,
        (workspaceId) => Authenticator.internalAdminForWorkspace(workspaceId),
        { concurrency: CONCURRENCY }
      );
      const authsByWorkspaceId = new Map(
        workspaceIds.map((workspaceId, index) => [workspaceId, auths[index]])
      );
      const results = await concurrentExecutor(
        agents,
        async (agent) => {
          const auth = authsByWorkspaceId.get(agent.workspaceId);
          assert(auth);
          // Each agent needs its own transaction and advisory lock to serialize with live editor
          // changes. Concurrency is capped at four to bound database pressure.
          return restoreAuthor(auth, agent, logger);
        },
        { concurrency: CONCURRENCY }
      );

      for (const [index, restored] of results.entries()) {
        const discovered = agents[index];
        if (!restored) {
          stats.agentsSkipped += 1;
          logger.info(
            {
              workspaceId: discovered.workspaceId,
              agentId: discovered.agentId,
              agentModelId: discovered.agentModelId,
            },
            "Skipped agent that is no longer editorless with an active author"
          );
          continue;
        }

        stats.authorsRestored += 1;
        logger.info(
          {
            workspaceId: restored.workspaceId,
            agentId: restored.agentId,
            agentModelId: restored.agentModelId,
            authorId: restored.authorId,
          },
          "Restored author as agent editor"
        );
      }
    }

    cursor = agents[agents.length - 1].agentModelId;
    logger.info(
      { execute, afterAgentId: cursor, batchAgents: agents.length, ...stats },
      "Editorless agent author restoration batch completed"
    );
  }

  if (execute) {
    const remaining = await fetchEditorlessAgents({
      afterAgentId: 0,
      wId,
      limit: 1,
    });
    if (remaining.length > 0) {
      const [agent] = remaining;
      logger.error(
        {
          workspaceId: agent.workspaceId,
          agentId: agent.agentId,
          agentModelId: agent.agentModelId,
        },
        "Editorless agent author restoration needs another pass"
      );
      throw new Error(
        "Eligible editorless agents remain; rerun from afterAgentId 0."
      );
    }
  }

  logger.info(
    { execute, afterAgentId: cursor, ...stats },
    execute
      ? "Editorless agent author restoration completed"
      : "Editorless agent author restoration dry run completed"
  );
  return stats;
}

if (process.argv[1]?.endsWith("20260922_restore_editorless_agent_authors.ts")) {
  makeScript(
    {
      wId: { type: "string", required: false },
      afterAgentId: {
        type: "number",
        default: 0,
        description: "Resume after a completed batch's numeric agent ID",
      },
    },
    async ({ execute, wId, afterAgentId }, logger) => {
      await restoreEditorlessAgentAuthors({
        execute,
        logger,
        wId,
        afterAgentId,
      });
    }
  );
}
