import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { consumptionQueryString } from "@app/lib/analytics/consumption_period";
import type { GetConsumptionGroupsWithActivityResponse } from "@app/lib/api/analytics/consumption/groups_with_activity";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { Fetcher } from "swr";

export type ConsumptionGroupWithActivityRow = {
  id: string;
  name: string;
  memberIds: string[];
};

// Caps the number of distinct groups returned (the aggregation itself already
// covers every group active in the period, unlike a top-N ranking).
const GROUPS_WITH_ACTIVITY_LIMIT = 100;

export function useConsumptionGroupsWithActivity({
  workspaceId,
  period,
  disabled,
}: {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const groupsWithActivityFetcher: Fetcher<GetConsumptionGroupsWithActivityResponse> =
    fetcher;

  const params = new URLSearchParams(consumptionQueryString(period));
  params.set("limit", String(GROUPS_WITH_ACTIVITY_LIMIT));

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/analytics/consumption/groups-with-activity?${params.toString()}`,
    groupsWithActivityFetcher,
    { disabled }
  );

  return {
    groups: data?.groups ?? emptyArray<ConsumptionGroupWithActivityRow>(),
    isGroupsWithActivityLoading: !error && !data && !disabled,
    isGroupsWithActivityError: error,
  };
}
