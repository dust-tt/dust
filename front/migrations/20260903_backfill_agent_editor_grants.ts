import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import { QueryTypes } from "sequelize";

const WORKSPACE_CONCURRENCY = 4;

type EditorSets = {
  legacyEditors: UserResource[];
  grantEditors: UserResource[];
  authors: UserResource[];
};

type EditorMembershipRow = {
  agentModelId: ModelId;
  userModelId: ModelId;
  source: "legacy" | "grant" | "author";
};

export type AgentEditorGrantStats = {
  agentCount: number;
  editorGrantsToAdd: number;
  mismatchedAgentCount: number;
  authorsWithoutGrantCount: number;
};

// The workspace index on agents bounds the outer scan, then the (agentId, version) unique index
// resolves each logical agent's latest non-draft version without scanning all historical
// configurations. Draft-only agents have no legacy editor group; active, pending, and archived
// agents all do and stay in scope.
async function fetchAgentHeads(
  workspaceModelId: ModelId
): Promise<AgentConfigurationModel[]> {
  // biome-ignore lint/plugin/noRawSql: Sequelize cannot express the indexed lateral head lookup.
  return frontSequelize.query(
    `
      SELECT configuration.*
      FROM agents AS agent
      INNER JOIN LATERAL (
        SELECT *
        FROM agent_configurations
        WHERE "workspaceId" = :workspaceId
          AND "agentId" = agent.id
          AND status != 'draft'
        ORDER BY version DESC
        LIMIT 1
      ) AS configuration ON TRUE
      WHERE agent."workspaceId" = :workspaceId
    `,
    {
      replacements: { workspaceId: workspaceModelId },
      type: QueryTypes.SELECT,
      model: AgentConfigurationModel,
      mapToModel: true,
    }
  );
}

// Uses the migration indexes on group_agents by configuration, group_permissions by resource,
// group_memberships by group/status, and memberships by workspace/user.
const SELECT_EDITOR_MEMBERSHIPS_SQL = `
  WITH active_group_memberships AS (
    SELECT "groupId", "userId"
    FROM group_memberships
    WHERE "workspaceId" = :workspaceId
      AND status = 'active'
      AND "startAt" <= :now
      AND ("endAt" IS NULL OR "endAt" > :now)
  ),
  active_workspace_members AS (
    SELECT "userId"
    FROM memberships
    WHERE "workspaceId" = :workspaceId
      AND "startAt" <= :now
      AND ("endAt" IS NULL OR "endAt" >= :now)
  )
  SELECT DISTINCT
    configuration."agentId" AS "agentModelId",
    group_membership."userId" AS "userModelId",
    'legacy' AS source
  FROM group_agents AS group_agent
  INNER JOIN agent_configurations AS configuration
    ON configuration.id = group_agent."agentConfigurationId"
  INNER JOIN groups AS editor_group
    ON editor_group.id = group_agent."groupId"
    AND editor_group."workspaceId" = :workspaceId
    AND editor_group.kind = 'agent_editors'
  INNER JOIN active_group_memberships AS group_membership
    ON group_membership."groupId" = editor_group.id
  INNER JOIN active_workspace_members AS membership
    ON membership."userId" = group_membership."userId"
  WHERE group_agent."workspaceId" = :workspaceId
    AND configuration."workspaceId" = :workspaceId
    AND configuration."agentId" IN (:agentModelIds)

  UNION ALL

  SELECT DISTINCT
    permission."resourceId" AS "agentModelId",
    group_membership."userId" AS "userModelId",
    'grant' AS source
  FROM group_permissions AS permission
  INNER JOIN groups AS editor_group
    ON editor_group.id = permission."groupId"
    AND editor_group."workspaceId" = :workspaceId
    AND editor_group.kind = 'regular_auto'
  INNER JOIN active_group_memberships AS group_membership
    ON group_membership."groupId" = editor_group.id
  INNER JOIN active_workspace_members AS membership
    ON membership."userId" = group_membership."userId"
  WHERE permission."workspaceId" = :workspaceId
    AND permission."grantType" = 'editor'
    AND permission."resourceType" = 'agent'
    AND permission."resourceId" IN (:agentModelIds)

  UNION ALL

  SELECT DISTINCT
    configuration."agentId" AS "agentModelId",
    configuration."authorId" AS "userModelId",
    'author' AS source
  FROM agent_configurations AS configuration
  INNER JOIN active_workspace_members AS membership
    ON membership."userId" = configuration."authorId"
  WHERE configuration."workspaceId" = :workspaceId
    AND configuration."agentId" IN (:agentModelIds)
`;

async function loadWorkspaceEditorState(
  configurations: AgentConfigurationModel[],
  workspace: LightWorkspaceType
): Promise<Map<ModelId, EditorSets>> {
  const editorsByAgent = new Map<ModelId, EditorSets>();
  for (const { agentId } of configurations) {
    editorsByAgent.set(agentId, {
      legacyEditors: [],
      grantEditors: [],
      authors: [],
    });
  }
  if (configurations.length === 0) {
    return editorsByAgent;
  }

  // biome-ignore lint/plugin/noRawSql: This migration compares both legacy and final joins in one query.
  const rows = await frontSequelize.query<EditorMembershipRow>(
    SELECT_EDITOR_MEMBERSHIPS_SQL,
    {
      replacements: {
        workspaceId: workspace.id,
        now: new Date(),
        agentModelIds: configurations.map(({ agentId }) => agentId),
      },
      type: QueryTypes.SELECT,
    }
  );
  const userModelIds = [...new Set(rows.map(({ userModelId }) => userModelId))];
  const users = await UserResource.fetchByModelIds(userModelIds);
  assert(users.length === userModelIds.length, "Agent editor user is missing.");
  const usersById = new Map(users.map((user) => [user.id, user]));

  for (const row of rows) {
    const editorSets = editorsByAgent.get(row.agentModelId);
    const user = usersById.get(row.userModelId);
    assert(editorSets && user);
    switch (row.source) {
      case "legacy":
        editorSets.legacyEditors.push(user);
        break;
      case "grant":
        editorSets.grantEditors.push(user);
        break;
      case "author":
        editorSets.authors.push(user);
        break;
      default:
        assertNever(row.source);
    }
  }

  return editorsByAgent;
}

function editorDifference(
  left: UserResource[],
  right: UserResource[]
): UserResource[] {
  const rightIds = new Set(right.map(({ id }) => id));
  return left.filter(({ id }) => !rightIds.has(id));
}

function reportEditorState(
  configurations: AgentConfigurationModel[],
  state: Map<ModelId, EditorSets>,
  { execute, logger, workspace }: BackfillSpec
): Pick<
  AgentEditorGrantStats,
  "mismatchedAgentCount" | "authorsWithoutGrantCount"
> {
  let mismatchedAgentCount = 0;
  let authorsWithoutGrantCount = 0;
  for (const configuration of configurations) {
    const editorSets = state.get(configuration.agentId);
    assert(editorSets);
    const legacyOnly = editorDifference(
      editorSets.legacyEditors,
      editorSets.grantEditors
    );
    const grantOnly = editorDifference(
      editorSets.grantEditors,
      editorSets.legacyEditors
    );
    if (legacyOnly.length > 0 || grantOnly.length > 0) {
      mismatchedAgentCount += 1;
      logger.warn(
        {
          workspaceId: workspace.sId,
          agentId: configuration.sId,
          agentStatus: configuration.status,
          legacyOnlyEditorIds: legacyOnly.map(({ sId }) => sId).sort(),
          grantOnlyEditorIds: grantOnly.map(({ sId }) => sId).sort(),
        },
        execute
          ? "Agent editor sets differ after grant backfill"
          : "Dry run: agent editor sets differ"
      );
    }

    const authorsWithoutGrant = editorDifference(
      editorSets.authors,
      editorSets.grantEditors
    );
    if (authorsWithoutGrant.length > 0) {
      authorsWithoutGrantCount += authorsWithoutGrant.length;
      logger.warn(
        {
          workspaceId: workspace.sId,
          agentId: configuration.sId,
          agentStatus: configuration.status,
          authorIds: authorsWithoutGrant.map(({ sId }) => sId).sort(),
        },
        "Agent authors are not explicit editors"
      );
    }
  }

  return { mismatchedAgentCount, authorsWithoutGrantCount };
}

type BackfillSpec = {
  execute: boolean;
  logger: Logger;
  workspace: LightWorkspaceType;
};

export async function backfillAgentEditorGrants({
  execute,
  logger,
  workspace,
}: BackfillSpec): Promise<AgentEditorGrantStats> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
  });
  const configurations = await fetchAgentHeads(workspace.id);
  const initialState = await loadWorkspaceEditorState(
    configurations,
    workspace
  );
  let editorGrantsToAdd = 0;

  // Keep writes sequential: each call takes the same per-agent advisory lock as live dual writes.
  // Set-based inserts would bypass that lock and could create two regular_auto groups for a grant.
  for (const configuration of configurations) {
    const editorSets = initialState.get(configuration.agentId);
    assert(editorSets);
    const missingEditors = editorDifference(
      editorSets.legacyEditors,
      editorSets.grantEditors
    );
    if (missingEditors.length === 0) {
      continue;
    }

    editorGrantsToAdd += missingEditors.length;
    if (execute) {
      await withTransaction(async (transaction) => {
        await AgentResource.fromAgentConfigurationModel(
          configuration
        ).grantEditors(auth, {
          editors: missingEditors.map((editor) => editor.toJSON()),
          transaction,
        });
      });
      logger.info(
        {
          workspaceId: workspace.sId,
          agentId: configuration.sId,
          agentStatus: configuration.status,
          editorIds: missingEditors.map(({ sId }) => sId).sort(),
        },
        "Backfilled agent editor grants"
      );
    }
  }

  // Re-read both sides after the writes so additions/removals racing the script are reported.
  const finalState = execute
    ? await loadWorkspaceEditorState(configurations, workspace)
    : initialState;
  const comparison = reportEditorState(configurations, finalState, {
    execute,
    logger,
    workspace,
  });
  const stats = {
    agentCount: configurations.length,
    editorGrantsToAdd,
    ...comparison,
  };
  logger.info(
    { workspaceId: workspace.sId, execute, ...stats },
    "Agent editor grant backfill completed for workspace"
  );
  return stats;
}

if (process.argv[1]?.endsWith("20260903_backfill_agent_editor_grants.ts")) {
  makeScript(
    {
      wId: { type: "string", required: false },
      fromWorkspace: {
        type: "number",
        required: false,
        description: "Resume from this numeric workspace model ID",
      },
    },
    async ({ execute, wId, fromWorkspace }, logger) => {
      await runOnAllWorkspaces(
        async (workspace) => {
          await backfillAgentEditorGrants({ execute, logger, workspace });
        },
        {
          concurrency: WORKSPACE_CONCURRENCY,
          wId,
          fromWorkspaceId: fromWorkspace,
        }
      );
    }
  );
}
