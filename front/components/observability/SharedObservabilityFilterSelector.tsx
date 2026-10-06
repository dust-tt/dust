import { OBSERVABILITY_TIME_RANGE } from "@app/components/agent_builder/observability/constants";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import type { AgentVersionMarker } from "@app/lib/api/assistant/observability/version_markers";
import { formatDateTime } from "@app/lib/i18n/format";
import { useAgentVersionMarkers } from "@app/lib/swr/assistants";
import type { ButtonSizeType } from "@dust-tt/sparkle";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useEffect } from "react";

function getVersionValue(
  versionMarker: AgentVersionMarker,
  t: (descriptor: MessageDescriptor) => string
) {
  const date = new Date(versionMarker.timestamp);
  const formattedTimeDisplay = formatDateTime(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const { version } = versionMarker;
  return t(msg`v${version}: ${formattedTimeDisplay}`);
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
  const { t } = useLingui();
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
        label={t`By time range`}
        onClick={() => setMode("timeRange")}
      />
      <ButtonsSwitch
        value="version"
        label={t`By version`}
        onClick={() => setMode("version")}
      />
    </ButtonsSwitchList>
  );
}

interface ObservabilityPeriodSelectorProps {
  workspaceId: string;
  agentConfigurationId: string;
  isCustomAgent: boolean;
  size?: ButtonSizeType;
}

export function ObservabilityPeriodSelector({
  workspaceId,
  agentConfigurationId,
  isCustomAgent,
  size = "xs",
}: ObservabilityPeriodSelectorProps) {
  const { t } = useLingui();
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
                ? getVersionValue(selectedVersion, t)
                : isVersionMarkersLoading
                  ? t`Loading`
                  : t`Not available`
            }
            size={size}
            variant="outline"
            isSelect
            disabled={versionMarkers.length === 0}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel label={t`Last 30 days`} />
          {(versionMarkers ?? []).map((marker) => (
            <DropdownMenuItem
              key={marker.version}
              label={getVersionValue(marker, t)}
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
          label={t`Last ${plural(period, { one: "# day", other: "# days" })}`}
          size={size}
          variant="outline"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OBSERVABILITY_TIME_RANGE.map((p) => (
          <DropdownMenuItem
            key={p}
            label={t`Last ${plural(p, { one: "# day", other: "# days" })}`}
            onClick={() => setPeriod(p)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
