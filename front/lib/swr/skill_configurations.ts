import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetSkillConfigurationsResponseBody } from "@app/pages/api/w/[wId]/skills";

export function useSkillConfigurations({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const skillConfigurationsFetcher: Fetcher<GetSkillConfigurationsResponseBody> =
    fetcher;

  const { data, error, isLoading } = useSWRWithDefaults(
    `/api/w/${workspaceId}/skills`,
    skillConfigurationsFetcher,
    { disabled }
  );

  return {
    skillConfigurations: data?.skillConfigurations ?? emptyArray(),
    isSkillConfigurationsError: !!error,
    isSkillConfigurationsLoading: isLoading,
  };
}
