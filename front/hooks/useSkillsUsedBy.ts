import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PostSkillsUsedByResponseBody } from "@app/types/api/skills";
import type { LightWorkspaceType } from "@app/types/user";

export function useSkillsUsedBy({
  owner,
  skillIds,
}: {
  owner: LightWorkspaceType;
  skillIds: string[];
}) {
  const { fetcherWithBody } = useFetcher();
  const url = `/api/w/${owner.sId}/skills/used_by`;
  const body = { skillIds };
  const disabled = skillIds.length === 0;
  const usedByFetcher = async (): Promise<PostSkillsUsedByResponseBody> =>
    fetcherWithBody([url, body, "POST"]);

  const { data, error, isLoading } = useSWRWithDefaults(
    [url, body],
    usedByFetcher,
    { disabled }
  );

  return {
    usedBy: data?.usedBy ?? null,
    isUsedByLoading: !disabled && isLoading,
    isUsedByError: !!error,
  };
}
