import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { SKILL_SEARCH_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { SystemSkillsRegistry } from "@app/lib/resources/skill/code_defined/system_registry";
import type { SkillSearchCursor } from "@app/lib/skill_search/cursor";
import {
  getSkillSearchFingerprint,
  readSkillSearchCursor,
  SkillSearchCursorError,
  writeSkillSearchCursor,
} from "@app/lib/skill_search/cursor";
import {
  compareRankedSkills,
  getSkillSearchScore,
} from "@app/lib/skill_search/ranking";
import {
  MAX_SKILL_SEARCH_RESULTS,
  prepareSkillSearchQuery,
  SKILL_SEARCH_KEEP_ALIVE_SECONDS,
  searchSkillDocumentCandidates,
} from "@app/lib/skill_search/search";
import { GLOBAL_SKILL_SEARCH_ALIASES } from "@app/lib/skills/global_search_aliases";
import type {
  SearchSkillsResponseBody,
  SkillSearchPermissionFiltering,
  SkillSearchResult,
} from "@app/types/api/skills";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

const MAX_CANDIDATE_BATCHES = 5;

export async function searchSkillsForCommandMenu(
  auth: Authenticator,
  {
    searchTerm,
    limit = MAX_SKILL_SEARCH_RESULTS,
    cursor,
    permissionFiltering = "strict",
  }: {
    searchTerm: string;
    limit?: number;
    cursor?: string;
    permissionFiltering?: SkillSearchPermissionFiltering;
  }
): Promise<
  Result<SearchSkillsResponseBody, ElasticsearchError | SkillSearchCursorError>
> {
  assert(
    Number.isInteger(limit) && limit > 0 && limit <= MAX_SKILL_SEARCH_RESULTS
  );
  const query = await prepareSkillSearchQuery(
    auth,
    searchTerm,
    permissionFiltering
  );
  const globalSkills = await GlobalSkillsRegistry.findAll(auth);
  const systemSkills = await SystemSkillsRegistry.findAll(auth);
  const codeDefinedSkills = [...globalSkills, ...systemSkills]
    .map((skill) => ({
      editedBy: null,
      icon: skill.icon,
      name: skill.name,
      requestedSpaceIds: [],
      sId: skill.sId,
      userFacingDescription: skill.userFacingDescription,
      score: getSkillSearchScore({
        searchTerm,
        name: skill.name,
        description: skill.userFacingDescription,
        aliases: GLOBAL_SKILL_SEARCH_ALIASES[skill.sId],
      }),
      canRead: true,
    }))
    .filter((skill) => skill.score > 0)
    .sort(compareRankedSkills);

  const fingerprint = getSkillSearchFingerprint({
    version: 1,
    workspaceId: auth.getNonNullableWorkspace().sId,
    userId: auth.user()?.sId,
    keyId: auth.key()?.id,
    query,
    permissionFiltering,
    codeDefinedSkills,
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

  const skills: SkillSearchResult[] = [];
  const candidateLimit = Math.min(200, Math.max(50, limit * 3));
  // Bounded batch reads, never one SQL request per skill or per user pod.
  for (
    let batch = 0;
    batch < MAX_CANDIDATE_BATCHES && skills.length < limit;
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
      if (skills.length === limit) {
        break;
      }
      if (candidate.skill) {
        const [score, name, sId] = candidate.sort;
        while (
          state.globalOffset < codeDefinedSkills.length &&
          skills.length < limit
        ) {
          const global = codeDefinedSkills[state.globalOffset];
          if (compareRankedSkills(global, { score, name, sId }) > 0) {
            break;
          }
          skills.push(global);
          state.globalOffset++;
        }
        if (skills.length === limit) {
          break;
        }
        skills.push(candidate.skill);
      }
      // Advance ONLY past returned or denied hits. Fetched hits displaced by
      // globals are deliberately refetched on the next page.
      state.searchAfter = candidate.sort;
      consumed++;
    }
    state.customExhausted =
      result.value.exhausted && consumed === result.value.candidates.length;
  }

  // Without proof that ES is exhausted, emitting remaining globals here could
  // put a low-scoring global ahead of a higher-scoring unseen custom skill.
  if (state.customExhausted) {
    const remaining = codeDefinedSkills.slice(
      state.globalOffset,
      state.globalOffset + limit - skills.length
    );
    skills.push(...remaining);
    state.globalOffset += remaining.length;
  }
  const hasMore =
    !state.customExhausted || state.globalOffset < codeDefinedSkills.length;
  let nextCursor: string | null = null;
  if (hasMore) {
    nextCursor = await writeSkillSearchCursor(fingerprint, state);
  } else if (!cursor) {
    // Most slash searches fit in one page. Release those snapshots immediately;
    // only real pagination sessions need to retain a PIT for cursor retries.
    await withEs((client) => client.closePointInTime({ id: state.pitId }));
  }
  // PITs expire naturally. Keeping them alive until then also permits retries
  // of an earlier page after the client has reached the last one.
  return new Ok({ skills, nextCursor });
}
