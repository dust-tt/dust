import type { AgentInactivitySnapshot } from "@app/lib/api/assistant/inactivity/policy";
import type { Authenticator } from "@app/lib/auth";
import { MentionResource } from "@app/lib/resources/mention_resource";

/**
 * Loads one page of a workspace's agents that have not been mentioned since the cutoff.
 *
 * The query is `MentionResource`'s; this owns the paging. One row beyond `limit` is fetched and
 * dropped, so `nextCursor` is non-null only when another candidate exists rather than whenever a page
 * happens to be full.
 *
 * Status and triggers deliberately do not come from here — `fetchArchivalFacts` in the caller is the
 * permission-filtered read and the authority on those.
 */

// TODO(2026-08-19 INACTIVE_AGENT_ARCHIVAL): run EXPLAIN (ANALYZE, BUFFERS) before enabling the
// nightly workflow. Measured volumetry suggests nothing is needed — worst workspace ~7.3k active
// agents, ~5.2k candidates at 30 days, two index seeks per agent — and the suspected bottleneck is the
// `ORDER BY "sId"` sort, since no index covers (workspaceId, status, "sId"). Measure before adding it.

/** The part of a snapshot this provides; derived so the two cannot drift. */
export type InactiveAgentCandidate = Pick<
  AgentInactivitySnapshot,
  "agentId" | "createdAt" | "lastMentionedAt"
>;

/**
 * Where to resume and how much to take. Infrastructure, not policy: `policy.ts` does not know it
 * exists. It is here so a Temporal workflow can walk a large workspace one durable step at a time.
 */
export interface AgentPageBound {
  // Last agent id of the previous page, or null to start from the beginning.
  cursor: string | null;
  limit: number;
}

export interface InactiveAgentsFetchInput {
  // Resolved once per operation by `computeInactivityCutoffAt`.
  cutoffAt: Date;
  page: AgentPageBound;
}

export interface InactiveAgentsPage {
  agents: InactiveAgentCandidate[];
  // Null once the workspace is exhausted.
  nextCursor: string | null;
}

export async function fetchInactiveAgents(
  auth: Authenticator,
  { cutoffAt, page: { cursor, limit } }: InactiveAgentsFetchInput
): Promise<InactiveAgentsPage> {
  const candidates = await MentionResource.listAgentsNotMentionedSince(auth, {
    notMentionedSince: cutoffAt,
    cursor,
    // One extra row, to tell "this page is full" apart from "there is more after it".
    limit: limit + 1,
  });

  const hasMore = candidates.length > limit;
  const agents = hasMore ? candidates.slice(0, limit) : candidates;

  // From the last agent, not the page length: with `limit: 0` the lookahead still finds a candidate.
  const lastAgent = agents.at(-1);
  const nextCursor = hasMore && lastAgent ? lastAgent.agentId : null;

  return { agents, nextCursor };
}
