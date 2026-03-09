import { OBSERVABILITY_TIME_RANGE } from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import type { AgentVersionMarker } from "@app/lib/api/assistant/observability/version_markers";
import { useAgentVersionMarkers } from "@app/lib/swr/assistants";
import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useEffect } from "react";

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

interface ObservabilityModeSelectorProps {
  workspaceId: string;
  agentConfigurationId: string;
  isCustomAgent: boolean;
}

export function ObservabilityModeSelector({
  workspaceId,
  agentConfigurationId,
  isCustomAgent,
}: ObservabilityModeSelectorProps) {
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

  if (!isCustomAgent) {
    return null;
  }

  return (
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
  );
}

interface ObservabilityPeriodSelectorProps {
  workspaceId: string;
  agentConfigurationId: string;
  isCustomAgent: boolean;
}

export function ObservabilityPeriodSelector({
  workspaceId,
  agentConfigurationId,
  isCustomAgent,
}: ObservabilityPeriodSelectorProps) {
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
