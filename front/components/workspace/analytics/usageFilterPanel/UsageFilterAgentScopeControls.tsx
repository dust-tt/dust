import type { UsageFilterScope } from "@app/components/workspace/analytics/usageFilter";
import {
  USAGE_FILTER_SCOPE_LABEL,
  USAGE_FILTER_SCOPES,
} from "@app/components/workspace/analytics/usageFilter";
import { Button, NavigationListLabel } from "@dust-tt/sparkle";

interface UsageFilterAgentScopeControlsProps {
  activeScope: UsageFilterScope;
  onScopeChange: (scope: UsageFilterScope) => void;
}

export function UsageFilterAgentScopeControls({
  activeScope,
  onScopeChange,
}: UsageFilterAgentScopeControlsProps) {
  return (
    <>
      <NavigationListLabel
        label="Scopes"
        className="bg-transparent font-medium"
      />
      <div className="flex items-center gap-1">
        {USAGE_FILTER_SCOPES.map((scope) => (
          <Button
            key={scope}
            label={USAGE_FILTER_SCOPE_LABEL[scope]}
            size="xs"
            variant={activeScope === scope ? "primary" : "outline"}
            onClick={() => onScopeChange(scope)}
          />
        ))}
      </div>
    </>
  );
}
