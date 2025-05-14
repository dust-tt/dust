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
import { useCallback, useMemo } from "react";
import React from "react";

import { GaugeDiff } from "@app/components/assistant_builder/instructions/GaugeDiff";
import type { LightAgentConfigurationType } from "@app/types";

interface InstructionHistoryProps {
  history: LightAgentConfigurationType[];
  selectedConfig: LightAgentConfigurationType | null;
  onSelect: (config: LightAgentConfigurationType) => void;
}

export function InstructionHistory({
  history,
  onSelect,
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

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      const timeA = a.versionCreatedAt
        ? new Date(a.versionCreatedAt).getTime()
        : a.version;
      const timeB = b.versionCreatedAt
        ? new Date(b.versionCreatedAt).getTime()
        : b.version;

      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return a.version - b.version;
    });
  }, [history]);

  // Deduplicate history items with the same instructions in a single pass
  const displayHistory = useMemo(() => {
    return sortedHistory.reduce<LightAgentConfigurationType[]>(
      (acc, config, index, array) => {
        const currentInstructions = config.instructions ?? "";
        const prevInstructions =
          index > 0 ? array[index - 1].instructions ?? "" : null;
        const isNewRun =
          index === 0 || currentInstructions !== prevInstructions;

        if (isNewRun) {
          acc.push(config);
        } else if (config.version === selectedConfig?.version) {
          acc[acc.length - 1] = config;
        }
        return acc;
      },
      []
    );
  }, [sortedHistory, selectedConfig]);

  // Compute previous instructions for each config in the display history
  const historyWithPrev = useMemo(() => {
    return displayHistory.map((config, index, array) => ({
      config,
      prevInstructions: index > 0 ? array[index - 1].instructions ?? "" : "",
    }));
  }, [displayHistory]);

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

      <DropdownMenuContent className="w-80">
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
          {historyWithPrev.map(({ config, prevInstructions }) => (
            <DropdownMenuRadioItem
              key={config.version}
              value={config.version.toString()}
            >
              <div className="flex w-full items-center justify-between">
                <span>{formatVersionLabel(config)}</span>
                <GaugeDiff
                  original={prevInstructions}
                  updated={config.instructions ?? ""}
                />
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
