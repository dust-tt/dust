import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PostCheckBigQueryLocationsResponseBody } from "@app/pages/api/w/[wId]/credentials/check_bigquery_locations";
import type { CheckBigQueryCredentials } from "@app/types/oauth/lib";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";

export function useBigQueryLocations({
  owner,
  credentials,
}: {
  owner: LightWorkspaceType;
  credentials?: CheckBigQueryCredentials | null;
}) {
  const { fetcherWithBody } = useFetcher();
  const url = `/api/w/${owner.sId}/credentials/check_bigquery_locations`;
  const fetchKey = useMemo(() => {
    return JSON.stringify({
      url,
      body: credentials,
    }); // Serialize with body to ensure uniqueness.
  }, [url, credentials]);

  const { data, error, mutate } = useSWRWithDefaults<
    string,
    PostCheckBigQueryLocationsResponseBody
  >(
    fetchKey,
    async () => {
      if (!url) {
        return undefined;
      }

      return fetcherWithBody([url, { credentials }, "POST"]);
    },
    { disabled: !credentials }
  );

  return {
    locations: data?.locations ?? undefined,
    isLocationsLoading: !error && !data,
    isLocationsError: !!error,
    error: error?.error,
    mutateLocations: mutate,
  };
}
