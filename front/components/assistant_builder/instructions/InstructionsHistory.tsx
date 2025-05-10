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

import { GaugeDiff } from "@app/components/assistant_builder/instructions/GaugeDiff";
import type { LightAgentConfigurationType } from "@app/types";

interface InstructionHistoryProps {
  history: LightAgentConfigurationType[];
  currentInstructions: string;
  selectedConfig: LightAgentConfigurationType | null;
  onSelect: (config: LightAgentConfigurationType) => void;
}

export function InstructionHistory({
  history,
  onSelect,
  currentInstructions,
  selectedConfig,
}: InstructionHistoryProps) {
  const formatVersionLabel = useCallback(
    (config: LightAgentConfigurationType) => {
      const dateFormatter = new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      });
      return config.versionCreatedAt
        ? dateFormatter.format(new Date(config.versionCreatedAt))
        : `v${config.version}`;
    },
    []
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
          value={selectedConfig?.version.toString() ?? ""}
          onValueChange={(selectedValue) => {
            const config = history.find(
              (c) => c.version.toString() === selectedValue
            );
            if (config) {
              onSelect(config);
            }
          }}
        >
          {history.map((config) => (
            <DropdownMenuRadioItem
              key={config.version}
              value={config.version.toString()}
            >
              <div className="flex w-full items-center justify-between">
                <span>{formatVersionLabel(config)}</span>
                <GaugeDiff
                  original={config.instructions || ""}
                  updated={currentInstructions}
                />
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
