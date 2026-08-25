import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import { ScopedConsumptionAnalytics } from "@app/components/workspace/analytics/consumption/ScopedConsumptionAnalytics";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

interface SkillInsightsTabProps {
  owner: LightWorkspaceType;
  skill: Pick<SkillType, "sId">;
}

export function SkillInsightsTab({ owner, skill }: SkillInsightsTabProps) {
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">Insights</h2>
        <ConsumptionPeriodSelector period={period} onPeriodChange={setPeriod} />
      </div>
      <ScopedConsumptionAnalytics
        owner={owner}
        period={period}
        scope={{ type: "skill", id: skill.sId }}
        defaultDimension="agent"
      />
    </div>
  );
}
