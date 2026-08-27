import type { UsageFilterAgentScope } from "@app/components/workspace/analytics/usageFilter";
import { USAGE_FILTER_SCOPE_LABEL } from "@app/components/workspace/analytics/usageFilter";
import { UsageFilterSection } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterSection";
import { FilterChips } from "@dust-tt/sparkle";

interface UsageFilterAgentScopeControlsProps {
  scopes: readonly UsageFilterAgentScope[];
  activeScope: UsageFilterAgentScope;
  onScopeChange: (scope: UsageFilterAgentScope) => void;
}

export function UsageFilterAgentScopeControls({
  scopes,
  activeScope,
  onScopeChange,
}: UsageFilterAgentScopeControlsProps) {
  return (
    <UsageFilterSection title="Scopes">
      <FilterChips
        filters={[...scopes]}
        selectedFilter={activeScope}
        onFilterClick={onScopeChange}
        getLabel={(scope) => USAGE_FILTER_SCOPE_LABEL[scope]}
      />
    </UsageFilterSection>
  );
}
