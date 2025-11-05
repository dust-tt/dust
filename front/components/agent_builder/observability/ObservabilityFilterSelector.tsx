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

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { OBSERVABILITY_TIME_RANGE } from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { useAgentVersionMarkers } from "@app/lib/swr/assistants";

interface ObservabilityFilterSelectorProps {
  agentConfigurationId: string;
}

export function ObservabilityFilterSelector({
  agentConfigurationId,
}: ObservabilityFilterSelectorProps) {
  const {
    mode,
    setMode,
    period,
    setPeriod,
    selectedVersion,
    setSelectedVersion,
  } = useObservabilityContext();

  const { owner } = useAgentBuilderContext();
  const { versionMarkers, isVersionMarkersLoading } = useAgentVersionMarkers({
    workspaceId: owner.sId,
    agentConfigurationId,
    days: period,
    disabled: false,
  });

  // Default to latest version when entering version mode with available markers
  useEffect(() => {
    if (
      mode === "version" &&
      !selectedVersion &&
      versionMarkers &&
      versionMarkers.length > 0
    ) {
      const latest = versionMarkers[versionMarkers.length - 1];
      setSelectedVersion(latest.version);
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
                  ? `v${selectedVersion}`
                  : isVersionMarkersLoading
                    ? "Loading"
                    : "Select"
              }
              size="xs"
              variant="outline"
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel label="Last 30 days" />
            {(versionMarkers ?? []).map((m) => (
              <DropdownMenuItem
                key={m.version}
                label={`v${m.version}`}
                onClick={() => setSelectedVersion(m.version)}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
