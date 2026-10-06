import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { GetSkillResponseBody } from "@app/types/api/skills";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { isAPIErrorResponse } from "@app/types/error";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";

const SKILL_REFERENCE_FETCH_CONCURRENCY = 4;

export function useSkillBuilderReferences({
  owner,
  skillIds,
}: {
  owner: LightWorkspaceType;
  skillIds: string[];
}) {
  const { fetcher } = useFetcher();
  const urls = skillIds.map((id) => `/api/w/${owner.sId}/skills/${id}`);
  const { data, error, isLoading } = useSWRWithDefaults(
    urls,
    async (urls: string[]) => {
      const skills = await concurrentExecutor(
        urls,
        async (url) => {
          try {
            const { skill }: GetSkillResponseBody = await fetcher(url);
            return skill.canRead && skill.status === "active" ? skill : null;
          } catch (error) {
            if (
              isAPIErrorResponse(error) &&
              error.error.type === "skill_not_found"
            ) {
              return null;
            }
            throw error;
          }
        },
        { concurrency: SKILL_REFERENCE_FETCH_CONCURRENCY }
      );
      return removeNulls(skills);
    },
    { disabled: skillIds.length === 0 }
  );

  return {
    references: data ?? emptyArray<SkillType>(),
    isReferencesLoading: isLoading,
    isReferencesError: !!error,
  };
}
