import type { UsageFilterAgentScope } from "@app/components/workspace/analytics/usageFilter";
import { USAGE_FILTER_SCOPE_LABEL } from "@app/components/workspace/analytics/usageFilter";
import { Button, NavigationListLabel } from "@dust-tt/sparkle";

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
    <>
      <NavigationListLabel
        label="Scopes"
        className="bg-transparent font-medium pt-2 pb-0"
      />
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
    </>
  );
}
