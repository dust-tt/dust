/**
 * Read-only count comparison for workspace-owned agents and skills.
 * Global agents and code-defined skills are indexed separately and excluded.
 *
 * From front/:
 *   npx tsx scripts/check_agent_skill_search_counts.ts --execute
 *   npx tsx scripts/check_agent_skill_search_counts.ts --wId <workspaceId> --execute
 */
import { GLOBAL_AGENTS_WORKSPACE_ID } from "@app/lib/agent_search/constants";
import {
  AGENT_SEARCH_ALIAS_NAME,
  SKILL_SEARCH_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import { frontSequelize } from "@app/lib/resources/storage";
import { CODE_DEFINED_SKILLS_WORKSPACE_ID } from "@app/lib/skill_search/constants";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { estypes } from "@elastic/elasticsearch";
import { QueryTypes } from "sequelize";

interface WorkspaceCounts {
  workspaceId: string;
  agents: number;
  skills: number;
}

interface CountAggregations {
  workspaces: {
    buckets: { key: { workspace_id: string }; doc_count: number }[];
    after_key?: Record<string, estypes.FieldValue>;
  };
}

/**
 * @cc [owner:aubin-tchoi,label:backend] search-count-db-scope
 * Count active and archived custom agents once per identity, using their current
 * configuration, and active and archived custom skills. Include empty workspaces.
 */
async function getDatabaseCounts(wId?: string): Promise<WorkspaceCounts[]> {
  // WORKSPACE_ISOLATION_BYPASS: read-only operator script compares counts across
  // all workspaces; an optional wId restricts every aggregate to that workspace.
  // biome-ignore lint/plugin/noRawSql: aggregate counts without hydrating resources or querying each workspace
  return frontSequelize.query<WorkspaceCounts>(
    `WITH selected_workspaces AS (
       SELECT id, "sId" FROM workspaces
       WHERE (CAST(:wId AS text) IS NULL OR "sId" = :wId)
     ), agent_counts AS (
       SELECT a."workspaceId", COUNT(*)::integer AS count
       FROM agents a
       JOIN selected_workspaces w ON w.id = a."workspaceId"
       JOIN agent_configurations ac
         ON ac."agentId" = a.id AND ac.version = a."currentVersion"
         AND ac."workspaceId" = a."workspaceId"
       WHERE ac.status IN ('active', 'archived') AND ac.scope != 'global'
       GROUP BY a."workspaceId"
     ), skill_counts AS (
       SELECT s."workspaceId", COUNT(*)::integer AS count
       FROM skill_configurations s
       JOIN selected_workspaces w ON w.id = s."workspaceId"
       WHERE s.status IN ('active', 'archived')
       GROUP BY s."workspaceId"
     )
     SELECT w."sId" AS "workspaceId",
            COALESCE(a.count, 0) AS agents, COALESCE(s.count, 0) AS skills
     FROM selected_workspaces w
     LEFT JOIN agent_counts a ON a."workspaceId" = w.id
     LEFT JOIN skill_counts s ON s."workspaceId" = w.id
     ORDER BY w.id`,
    { type: QueryTypes.SELECT, replacements: { wId: wId ?? null } }
  );
}

/**
 * @cc [owner:aubin-tchoi,label:backend;error-handling] search-count-es-completeness
 * Count every document outside the shared namespace, including unexpected statuses.
 * Paginate workspace buckets until exhausted. Query failures, timeouts, failed shards,
 * or missing aggregations MUST abort this script by throwing to makeScript's handler.
 */
async function getElasticsearchCounts({
  index,
  globalWorkspaceId,
  wId,
}: {
  index: string;
  globalWorkspaceId: string;
  wId?: string;
}): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let after: Record<string, estypes.FieldValue> | undefined;

  do {
    const result = await withEs((client) =>
      client.search<never, CountAggregations>({
        index,
        size: 0,
        track_total_hits: false,
        allow_partial_search_results: false,
        query: {
          bool: {
            ...(wId && { filter: [{ term: { workspace_id: wId } }] }),
            must_not: [{ term: { workspace_id: globalWorkspaceId } }],
          },
        },
        aggs: {
          workspaces: {
            composite: {
              size: 1000,
              sources: [{ workspace_id: { terms: { field: "workspace_id" } } }],
              ...(after && { after }),
            },
          },
        },
      })
    );
    if (result.isErr()) {
      throw result.error;
    }
    const response = result.value;
    if (
      response.timed_out ||
      response._shards.failed > 0 ||
      !response.aggregations
    ) {
      throw new Error(`Incomplete Elasticsearch count response for ${index}`);
    }

    const { buckets, after_key } = response.aggregations.workspaces;
    for (const bucket of buckets) {
      counts.set(bucket.key.workspace_id, bucket.doc_count);
    }
    after = buckets.length > 0 ? after_key : undefined;
  } while (after);

  return counts;
}

/**
 * @cc [owner:aubin-tchoi,label:backend;error-handling] search-count-check-read-only
 * This check MUST NOT mutate DB or ES. Compare the union of DB and ES workspace IDs.
 * Unknown workspace IDs and unequal counts MUST be logged and cause a nonzero exit
 * by throwing to makeScript's handler after reporting the summary. An unknown wId
 * MUST also fail, rather than report an empty successful check.
 */
async function checkCounts(wId: string | undefined, logger: Logger) {
  const [databaseCounts, agentCounts, skillCounts] = await Promise.all([
    getDatabaseCounts(wId),
    getElasticsearchCounts({
      index: AGENT_SEARCH_ALIAS_NAME,
      globalWorkspaceId: GLOBAL_AGENTS_WORKSPACE_ID,
      wId,
    }),
    getElasticsearchCounts({
      index: SKILL_SEARCH_ALIAS_NAME,
      globalWorkspaceId: CODE_DEFINED_SKILLS_WORKSPACE_ID,
      wId,
    }),
  ]);
  if (wId && databaseCounts.length === 0) {
    throw new Error(`Workspace not found: ${wId}`);
  }

  const databaseByWorkspace = new Map(
    databaseCounts.map((counts) => [counts.workspaceId, counts])
  );
  const workspaceIds = new Set([
    ...databaseByWorkspace.keys(),
    ...agentCounts.keys(),
    ...skillCounts.keys(),
  ]);
  let mismatches = 0;
  for (const workspaceId of workspaceIds) {
    const db = databaseByWorkspace.get(workspaceId);
    const agentsES = agentCounts.get(workspaceId) ?? 0;
    const skillsES = skillCounts.get(workspaceId) ?? 0;
    const matches = !!db && db.agents === agentsES && db.skills === skillsES;
    const counts = {
      workspaceId,
      workspaceExists: !!db,
      agentsDB: db?.agents ?? 0,
      agentsES,
      skillsDB: db?.skills ?? 0,
      skillsES,
    };
    if (matches) {
      logger.info(counts, "[SearchCounts] Workspace counts match");
    } else {
      mismatches++;
      logger.error(counts, "[SearchCounts] Workspace counts differ");
    }
  }
  logger.info(
    { workspaces: workspaceIds.size, mismatches },
    "[SearchCounts] Check complete"
  );
  if (mismatches > 0) {
    throw new Error(`Search counts differ for ${mismatches} workspace(s)`);
  }
}

makeScript(
  {
    wId: {
      type: "string",
      describe: "Workspace sId to check (omit to check all workspaces).",
    },
  },
  async ({ wId }, logger) => {
    await checkCounts(wId, logger);
  }
);
