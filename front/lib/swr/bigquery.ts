import { useMemo } from "react";

import { fetcherWithBody, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PostCheckBigQueryLocationsResponseBody } from "@app/pages/api/w/[wId]/credentials/check_bigquery_locations";
import type { CheckBigQueryCredentials, LightWorkspaceType } from "@app/types";

export function useBigQueryLocations({
  owner,
  credentials,
}: {
  owner: LightWorkspaceType;
  credentials?: CheckBigQueryCredentials | null;
}) {
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
    locations: useMemo(() => (data ? data.locations : []), [data]),
    isLocationsLoading: !error && !data,
    isLocationsError: !!error,
    mutateLocations: mutate,
  };
}
