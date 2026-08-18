import type { UsageFilterAgentScope } from "@app/components/workspace/analytics/usageFilter";
import { USAGE_FILTER_SCOPE_LABEL } from "@app/components/workspace/analytics/usageFilter";
import { UsageFilterSection } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterSection";
import { Button } from "@dust-tt/sparkle";

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
      <div className="flex items-center gap-1">
        {scopes.map((scope) => (
          <Button
            key={scope}
            label={USAGE_FILTER_SCOPE_LABEL[scope]}
            size="xs"
            variant={activeScope === scope ? "primary" : "outline"}
            aria-pressed={activeScope === scope}
            onClick={() => onScopeChange(scope)}
          />
        ))}
      </div>
    </UsageFilterSection>
  );
}
