import { USAGE_FILTER_SCOPE_LABEL } from "@app/components/workspace/analytics/usageFilter";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { AGENT_CONFIGURATION_SCOPES } from "@app/types/assistant/agent";
import { Button, NavigationListLabel } from "@dust-tt/sparkle";

interface UsageFilterAgentScopeControlsProps {
  activeScope: AgentConfigurationScope;
  onScopeChange: (scope: AgentConfigurationScope) => void;
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
        {AGENT_CONFIGURATION_SCOPES.map((scope) => (
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
