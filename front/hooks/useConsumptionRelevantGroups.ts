import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { consumptionQueryString } from "@app/lib/analytics/consumption_period";
// Type-only: importing a value from this module would pull the Elasticsearch
// client into the browser bundle (see the note in `series.ts`).
import type { GetConsumptionRelevantGroupsResponse } from "@app/lib/api/analytics/consumption/relevant_groups";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { Fetcher } from "swr";

export type ConsumptionRelevantGroupRow = {
  id: string;
  name: string;
  memberIds: string[];
};

// Broader than the Attribution table's own top-N (25): the picker needs wider
// coverage of the period's active population than a ranking display does.
const RELEVANT_GROUPS_LIMIT = 100;

export function useConsumptionRelevantGroups({
  workspaceId,
  period,
  disabled,
}: {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const relevantGroupsFetcher: Fetcher<GetConsumptionRelevantGroupsResponse> =
    fetcher;

  const params = new URLSearchParams(consumptionQueryString(period));
  params.set("limit", String(RELEVANT_GROUPS_LIMIT));

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/analytics/consumption/relevant-groups?${params.toString()}`,
    relevantGroupsFetcher,
    { disabled }
  );

  return {
    groups: data?.groups ?? emptyArray<ConsumptionRelevantGroupRow>(),
    isRelevantGroupsLoading: !error && !data && !disabled,
    isRelevantGroupsError: error,
  };
}
