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

import { OBSERVABILITY_TIME_RANGE } from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import type { AgentVersionMarker } from "@app/lib/api/assistant/observability/version_markers";
import { useAgentVersionMarkers } from "@app/lib/swr/assistants";

interface SharedObservabilityFilterSelectorProps {
  workspaceId: string;
  agentConfigurationId: string;
}

function getVersionValue(versionMarker: AgentVersionMarker) {
  return `v${versionMarker.version}: ${versionMarker.timestamp}`;
}

export function SharedObservabilityFilterSelector({
  workspaceId,
  agentConfigurationId,
}: SharedObservabilityFilterSelectorProps) {
  const {
    mode,
    setMode,
    period,
    setPeriod,
    selectedVersion,
    setSelectedVersion,
  } = useObservabilityContext();

  const { versionMarkers, isVersionMarkersLoading } = useAgentVersionMarkers({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: false,
  });

  useEffect(() => {
    if (
      mode === "version" &&
      !selectedVersion &&
      versionMarkers &&
      versionMarkers.length > 0
    ) {
      const value = getVersionValue(versionMarkers[versionMarkers.length - 1]);
      setSelectedVersion(value);
    }
  }, [mode, selectedVersion, versionMarkers, setSelectedVersion]);

  return (
    <div className="flex items-center gap-3">
      <ButtonsSwitchList defaultValue={mode} size="xs">
        <ButtonsSwitch
          value="timeRange"
          label="Time range"
          onClick={() => setMode("timeRange")}
        />
        <ButtonsSwitch
          value="version"
          label="Version"
          onClick={() => setMode("version")}
        />
      </ButtonsSwitchList>

      {mode === "timeRange" ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              label={`${period} days`}
              size="xs"
              variant="outline"
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {OBSERVABILITY_TIME_RANGE.map((p) => (
              <DropdownMenuItem
                key={p}
                label={`${p} days`}
                onClick={() => setPeriod(p)}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              label={
                selectedVersion
                  ? selectedVersion
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
            {(versionMarkers ?? []).map((m) => {
              const versionValue = getVersionValue(m);
              return (
                <DropdownMenuItem
                  key={m.version}
                  label={versionValue}
                  onClick={() => setSelectedVersion(versionValue)}
                />
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
