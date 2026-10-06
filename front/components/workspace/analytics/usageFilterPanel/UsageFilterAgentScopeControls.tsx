import { FilterSection } from "@app/components/shared/filter_panel/FilterSection";
import type { UsageFilterAgentScope } from "@app/components/workspace/analytics/usageFilter";
import { Button } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

const SCOPE_LABEL: Record<UsageFilterAgentScope, MessageDescriptor> = {
  global: msg`Company`,
  visible: msg`Shared`,
  hidden: msg`Private`,
  all: msg({ message: "All", context: "agent scopes" }),
};

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
  const { t } = useLingui();
  return (
    <FilterSection title={t`Scopes`}>
      <div className="flex items-center gap-1">
        {scopes.map((scope) => (
          <Button
            key={scope}
            label={t(SCOPE_LABEL[scope])}
            size="xs"
            variant={activeScope === scope ? "primary" : "outline"}
            aria-pressed={activeScope === scope}
            onClick={() => onScopeChange(scope)}
          />
        ))}
      </div>
    </FilterSection>
  );
}
