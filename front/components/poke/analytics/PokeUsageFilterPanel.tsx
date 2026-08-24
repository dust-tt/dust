import type { UsageFilterPanelProps } from "@app/components/workspace/analytics/UsageFilterPanel";
import {
  UsageFilterPanelView,
  useUsageFilterPanelState,
} from "@app/components/workspace/analytics/UsageFilterPanel";
import { usePokeConsumptionFacets } from "@app/poke/swr/consumption";

export function PokeUsageFilterPanel({
  owner,
  period,
  filter,
  onFilterChange,
  showMemberGroupFilter = false,
}: UsageFilterPanelProps) {
  const state = useUsageFilterPanelState({
    owner,
    filter,
    showMemberGroupFilter,
  });
  const {
    options: categoryOptions,
    isFacetsLoading,
    isFacetsError,
    isFacetsValidating,
  } = usePokeConsumptionFacets({
    workspaceId: owner.sId,
    period,
    filter: state.draftScopeFilter,
    disabled: !state.isOpen,
  });

  return (
    <UsageFilterPanelView
      filter={filter}
      onFilterChange={onFilterChange}
      showMemberGroupFilter={showMemberGroupFilter}
      state={state}
      categoryOptions={categoryOptions}
      isFacetsLoading={isFacetsLoading}
      isFacetsError={Boolean(isFacetsError)}
      isFacetsValidating={isFacetsValidating}
    />
  );
}
