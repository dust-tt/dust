import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  HistoryIcon,
} from "@dust-tt/sparkle";
import { useCallback } from "react";
import React from "react";

import type { LightAgentConfigurationType } from "@app/types";

export function PromptHistory({
  history,
  onConfigChange,
  currentConfig,
}: {
  history: LightAgentConfigurationType[];
  onConfigChange: (config: LightAgentConfigurationType) => void;
  currentConfig: LightAgentConfigurationType | null;
}) {
  const dateFormatter = new Intl.DateTimeFormat(navigator.language, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });

  const formatVersionLabel = useCallback(
    (config: LightAgentConfigurationType) => {
      return config.versionCreatedAt
        ? dateFormatter.format(new Date(config.versionCreatedAt))
        : `v${config.version}`;
    },
    [dateFormatter]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          icon={HistoryIcon}
          size="sm"
          tooltip="Compare with previous versions"
          isSelect
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel label="Choose version to compare" />
        <DropdownMenuSeparator />

        <DropdownMenuRadioGroup
          value={currentConfig?.version.toString()}
          onValueChange={(selectedValue) => {
            const selectedConfig = history.find(
              (config) => config.version.toString() === selectedValue
            );
            if (selectedConfig) {
              onConfigChange(selectedConfig);
            }
          }}
        >
          {history.map((config) => (
            <DropdownMenuRadioItem
              key={config.version}
              value={config.version.toString()}
              label={formatVersionLabel(config)}
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
