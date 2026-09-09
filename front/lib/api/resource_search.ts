import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  AGENT_SEARCH_ALIAS_NAME,
  SKILL_SEARCH_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { listCodeDefinedSearchAgents } from "@app/lib/search/code_defined_agents";
import { listCodeDefinedSearchSkills } from "@app/lib/search/code_defined_skills";
import type { ResourceSearchCursor } from "@app/lib/search/cursor";
import {
  getResourceSearchFingerprint,
  ResourceSearchCursorError,
  readResourceSearchCursor,
  writeResourceSearchCursor,
} from "@app/lib/search/cursor";
import { compareRankedResources } from "@app/lib/search/ranking";
import type { ResourceSearchEntry } from "@app/lib/search/resource_candidates";
import { searchResourceCandidates } from "@app/lib/search/resource_candidates";
import {
  MAX_RESOURCE_SEARCH_RESULTS,
  prepareResourceSearchQuery,
  RESOURCE_SEARCH_KEEP_ALIVE_SECONDS,
} from "@app/lib/search/resource_query";
import type {
  ResourceSearchOptions,
  SearchResourceType,
} from "@app/types/search";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

const MAX_CANDIDATE_BATCHES = 5;

/**
 * @cc [owner:aubin-tchoi,label:security;product] unified-search-pagination
 * Skills and agents share one ranked stream; ES cursors advance only past returned or denied
 * hits, never hits displaced by code-defined resources. Cursors are bound to workspace, caller,
 * query, resource types, permission mode and catalog. Every candidate batch rechecks current ACLs.
 */
export async function searchResources(
  auth: Authenticator,
  options: ResourceSearchOptions
): Promise<
  Result<
    { results: ResourceSearchEntry[]; nextCursor: string | null },
    ElasticsearchError | ResourceSearchCursorError
  >
> {
  const {
    limit = MAX_RESOURCE_SEARCH_RESULTS,
    cursor,
    permissionFiltering = "strict",
  } = options;
  const resourceTypes = [
    ...new Set<SearchResourceType>(options.resourceTypes ?? ["skill", "agent"]),
  ].sort();
  assert(
    Number.isInteger(limit) && limit > 0 && limit <= MAX_RESOURCE_SEARCH_RESULTS
  );
  const query = prepareResourceSearchQuery(auth, { ...options, resourceTypes });
  const [skills, agents] = await Promise.all([
    resourceTypes.includes("skill")
      ? listCodeDefinedSearchSkills(auth, options)
      : [],
    resourceTypes.includes("agent")
      ? listCodeDefinedSearchAgents(auth, options)
      : [],
  ]);
  const codeDefined: ResourceSearchEntry[] = [...skills, ...agents].sort(
    (a, b) =>
      compareRankedResources(
        { name: a.resource.name, sId: a.resource.sId, score: a.score },
        { name: b.resource.name, sId: b.resource.sId, score: b.score }
      )
  );
  const fingerprint = getResourceSearchFingerprint({
    version: 4,
    workspaceId: auth.getNonNullableWorkspace().sId,
    userId: auth.user()?.sId,
    keyId: auth.key()?.id,
    query,
    resourceTypes,
    permissionFiltering,
    codeDefined: codeDefined.map((entry) => ({
      type: entry.type,
      resource:
        entry.type === "skill"
          ? entry.resource.toSearchListingJSON(auth)
          : entry.resource,
      score: entry.score,
    })),
  });
  let state: ResourceSearchCursor;
  if (cursor) {
    const saved = await readResourceSearchCursor(fingerprint, cursor);
    if (!saved) {
      return new Err(new ResourceSearchCursorError());
    }
    state = saved;
  } else {
    const pit = await withEs((client) =>
      client.openPointInTime({
        index: resourceTypes.map((type) =>
          type === "skill" ? SKILL_SEARCH_ALIAS_NAME : AGENT_SEARCH_ALIAS_NAME
        ),
        keep_alive: `${RESOURCE_SEARCH_KEEP_ALIVE_SECONDS}s`,
      })
    );
    if (pit.isErr()) {
      return pit;
    }
    state = {
      pitId: pit.value.id,
      searchAfter: null,
      globalOffset: 0,
      customExhausted: false,
    };
  }
  const results: ResourceSearchEntry[] = [];
  const candidateLimit = Math.min(200, Math.max(50, limit * 3));
  for (
    let batch = 0;
    batch < MAX_CANDIDATE_BATCHES && results.length < limit;
    batch++
  ) {
    if (state.customExhausted) {
      break;
    }
    const result = await searchResourceCandidates(auth, {
      query,
      pitId: state.pitId,
      searchAfter: state.searchAfter,
      limit: candidateLimit,
      resourceTypes,
      permissionFiltering,
    });
    if (result.isErr()) {
      return result.error.statusCode === 404
        ? new Err(new ResourceSearchCursorError())
        : result;
    }
    state.pitId = result.value.pitId;
    let consumed = 0;
    for (const candidate of result.value.candidates) {
      if (results.length === limit) {
        break;
      }
      if (candidate.entry) {
        const [score, name, sId] = candidate.sort;
        while (
          state.globalOffset < codeDefined.length &&
          results.length < limit
        ) {
          const global = codeDefined[state.globalOffset];
          if (
            compareRankedResources(
              {
                score: global.score,
                name: global.resource.name,
                sId: global.resource.sId,
              },
              { score, name, sId }
            ) > 0
          ) {
            break;
          }
          results.push(global);
          state.globalOffset++;
        }
        if (results.length === limit) {
          break;
        }
        results.push(candidate.entry);
      }
      state.searchAfter = candidate.sort;
      consumed++;
    }
    state.customExhausted =
      result.value.exhausted && consumed === result.value.candidates.length;
  }
  // Do not emit lower-ranked globals ahead of custom hits that have not been recalled yet.
  if (state.customExhausted) {
    const remaining = codeDefined.slice(
      state.globalOffset,
      state.globalOffset + limit - results.length
    );
    results.push(...remaining);
    state.globalOffset += remaining.length;
  }
  const hasMore =
    !state.customExhausted || state.globalOffset < codeDefined.length;
  const nextCursor = hasMore
    ? await writeResourceSearchCursor(fingerprint, state)
    : null;
  if (!hasMore && !cursor) {
    await withEs((client) => client.closePointInTime({ id: state.pitId }));
  }
  return new Ok({ results, nextCursor });
}
