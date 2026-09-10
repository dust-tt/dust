import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { SKILL_SEARCH_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { listCodeDefinedSearchSkills } from "@app/lib/skill_search/code_defined";
import type { SkillSearchCursor } from "@app/lib/skill_search/cursor";
import {
  getSkillSearchFingerprint,
  readSkillSearchCursor,
  SkillSearchCursorError,
  writeSkillSearchCursor,
} from "@app/lib/skill_search/cursor";
import { compareRankedSkills } from "@app/lib/skill_search/ranking";
import {
  MAX_SKILL_SEARCH_RESULTS,
  prepareSkillSearchQuery,
  SKILL_SEARCH_KEEP_ALIVE_SECONDS,
  searchSkillDocumentCandidates,
} from "@app/lib/skill_search/search";
import type {
  SkillSearchOptions,
  SkillSearchResult,
} from "@app/types/api/skills";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

const MAX_CANDIDATE_BATCHES = 5;

/**
 * @cc [owner:aubin-tchoi,label:security;product] unified-search-pagination
 * Indexed and code-defined skills share one ranked stream; cursors advance only past returned or denied
 * hits, never hits displaced by code-defined resources. Cursors are bound to workspace, caller,
 * query, permission mode and catalog. Every candidate batch rechecks current ACLs.
 */
export async function searchSkillsForCommandMenu(
  auth: Authenticator,
  options: SkillSearchOptions
): Promise<
  Result<
    { skills: SkillSearchResult[]; nextCursor: string | null },
    ElasticsearchError | SkillSearchCursorError
  >
> {
  const {
    limit = MAX_SKILL_SEARCH_RESULTS,
    cursor,
    permissionFiltering = "strict",
  } = options;
  assert(
    Number.isInteger(limit) && limit > 0 && limit <= MAX_SKILL_SEARCH_RESULTS
  );
  const query = prepareSkillSearchQuery(
    auth,
    options.searchTerm,
    permissionFiltering,
    options
  );
  const codeDefined = await listCodeDefinedSearchSkills(auth, options);
  const fingerprint = getSkillSearchFingerprint({
    version: 6,
    workspaceId: auth.getNonNullableWorkspace().sId,
    userId: auth.user()?.sId,
    keyId: auth.key()?.id,
    query,
    permissionFiltering,
    codeDefined,
  });
  let state: SkillSearchCursor;
  if (cursor) {
    const saved = await readSkillSearchCursor(fingerprint, cursor);
    if (!saved) {
      return new Err(new SkillSearchCursorError());
    }
    state = saved;
  } else {
    const pit = await withEs((client) =>
      client.openPointInTime({
        index: SKILL_SEARCH_ALIAS_NAME,
        keep_alive: `${SKILL_SEARCH_KEEP_ALIVE_SECONDS}s`,
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
  const results: SkillSearchResult[] = [];
  const candidateLimit = Math.min(200, Math.max(50, limit * 3));
  for (
    let batch = 0;
    batch < MAX_CANDIDATE_BATCHES && results.length < limit;
    batch++
  ) {
    if (state.customExhausted) {
      break;
    }
    const result = await searchSkillDocumentCandidates(auth, {
      query,
      pitId: state.pitId,
      searchAfter: state.searchAfter,
      limit: candidateLimit,
      permissionFiltering,
    });
    if (result.isErr()) {
      return result.error.statusCode === 404
        ? new Err(new SkillSearchCursorError())
        : result;
    }
    state.pitId = result.value.pitId;
    let consumed = 0;
    for (const candidate of result.value.candidates) {
      if (results.length === limit) {
        break;
      }
      if (candidate.skill) {
        const [score, name, sId] = candidate.sort;
        while (
          state.globalOffset < codeDefined.length &&
          results.length < limit
        ) {
          const global = codeDefined[state.globalOffset];
          if (
            compareRankedSkills(
              {
                score: global.score,
                name: global.name,
                sId: global.sId,
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
        results.push(candidate.skill);
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
    ? await writeSkillSearchCursor(fingerprint, state)
    : null;
  if (!hasMore && !cursor) {
    await withEs((client) => client.closePointInTime({ id: state.pitId }));
  }
  return new Ok({ skills: results, nextCursor });
}
