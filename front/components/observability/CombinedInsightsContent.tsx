import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { OBSERVABILITY_TIME_RANGE } from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { AgentFeedback } from "@app/components/observability/AgentFeedback";
import { AgentObservability } from "@app/components/observability/AgentObservability";
import type { AgentVersionMarker } from "@app/lib/api/assistant/observability/version_markers";
import { useAgentVersionMarkers } from "@app/lib/swr/assistants";
import type { LightWorkspaceType } from "@app/types";

type InsightsSubTab = "analytics" | "feedback";

function getVersionValue(versionMarker: AgentVersionMarker) {
  const date = new Date(versionMarker.timestamp);
  const formattedTimeDisplay = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `v${versionMarker.version}: ${formattedTimeDisplay}`;
}

interface InsightsHeaderProps {
  isCustomAgent: boolean;
  workspaceId: string;
  agentConfigurationId: string;
}

function InsightsHeader({
  isCustomAgent,
  workspaceId,
  agentConfigurationId,
}: InsightsHeaderProps) {
  const { mode, setMode, period, selectedVersion, setSelectedVersion } =
    useObservabilityContext();

  const { versionMarkers } = useAgentVersionMarkers({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: !isCustomAgent,
  });

  useEffect(() => {
    if (
      mode === "version" &&
      !selectedVersion &&
      versionMarkers &&
      versionMarkers.length > 0
    ) {
      setSelectedVersion(versionMarkers[versionMarkers.length - 1]);
    }
  }, [mode, selectedVersion, versionMarkers, setSelectedVersion]);

  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold text-foreground dark:text-foreground-night">
        Insights
      </h2>
      {isCustomAgent && (
        <ButtonsSwitchList defaultValue={mode} size="xs">
          <ButtonsSwitch
            value="timeRange"
            label="By Timerange"
            onClick={() => setMode("timeRange")}
          />
          <ButtonsSwitch
            value="version"
            label="By version"
            onClick={() => setMode("version")}
          />
        </ButtonsSwitchList>
      )}
    </div>
  );
}

interface PeriodSelectorProps {
  isCustomAgent: boolean;
  workspaceId: string;
  agentConfigurationId: string;
}

function PeriodSelector({
  isCustomAgent,
  workspaceId,
  agentConfigurationId,
}: PeriodSelectorProps) {
  const { mode, period, setPeriod, selectedVersion, setSelectedVersion } =
    useObservabilityContext();

  const { versionMarkers, isVersionMarkersLoading } = useAgentVersionMarkers({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: !isCustomAgent,
  });

  if (isCustomAgent && mode === "version") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            label={
              selectedVersion
                ? getVersionValue(selectedVersion)
                : isVersionMarkersLoading
                  ? "Loading"
                  : "Not available"
            }
            size="xs"
            variant="outline"
            isSelect
            disabled={versionMarkers.length === 0}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel label="Last 30 days" />
          {(versionMarkers ?? []).map((marker) => (
            <DropdownMenuItem
              key={marker.version}
              label={getVersionValue(marker)}
              onClick={() => setSelectedVersion(marker)}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label={`Last ${period} days`}
          size="xs"
          variant="outline"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OBSERVABILITY_TIME_RANGE.map((p) => (
          <DropdownMenuItem
            key={p}
            label={`Last ${p} days`}
            onClick={() => setPeriod(p)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface CombinedInsightsContentProps {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
  isCustomAgent: boolean;
}

export function CombinedInsightsContent({
  owner,
  agentConfigurationId,
  isCustomAgent,
}: CombinedInsightsContentProps) {
  const [selectedSubTab, setSelectedSubTab] =
    useState<InsightsSubTab>("analytics");

  return (
    <div className="flex flex-col gap-4">
      <InsightsHeader
        isCustomAgent={isCustomAgent}
        workspaceId={owner.sId}
        agentConfigurationId={agentConfigurationId}
      />
      <Tabs
        value={selectedSubTab}
        onValueChange={(value) => setSelectedSubTab(value as InsightsSubTab)}
      >
        <div className="flex items-center justify-between">
          <TabsList border={true}>
            <TabsTrigger value="analytics" label="Analytics" />
            <TabsTrigger value="feedback" label="Feedback" />
          </TabsList>
          <PeriodSelector
            isCustomAgent={isCustomAgent}
            workspaceId={owner.sId}
            agentConfigurationId={agentConfigurationId}
          />
        </div>
        <TabsContent value="analytics">
          <AgentObservability
            owner={owner}
            agentConfigurationId={agentConfigurationId}
            isCustomAgent={isCustomAgent}
            hideHeader
          />
        </TabsContent>
        <TabsContent value="feedback">
          <AgentFeedback
            owner={owner}
            agentConfigurationId={agentConfigurationId}
            allowReactions={isCustomAgent}
            hideHeader
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
