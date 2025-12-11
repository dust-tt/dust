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
  Spinner,
} from "@dust-tt/sparkle";
import { compareDesc } from "date-fns";
import { format } from "date-fns/format";
import { useCallback, useMemo } from "react";
import React from "react";

import { useEditors } from "@app/lib/swr/agent_editors";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";

interface AgentInstructionsHistoryProps {
  history: LightAgentConfigurationType[];
  selectedConfig: LightAgentConfigurationType | null;
  onSelect: (config: LightAgentConfigurationType) => void;
  owner: LightWorkspaceType;
  agentConfigurationId: string | null;
}

export function AgentInstructionsHistory({
  history,
  onSelect,
  selectedConfig,
  owner,
  agentConfigurationId,
}: AgentInstructionsHistoryProps) {
  const { editors, isEditorsLoading } = useEditors({
    owner,
    agentConfigurationId,
    disabled: !agentConfigurationId,
  });

  const authorMap = useMemo(() => {
    const map: Record<string, string> = {};
    editors.forEach((editor) => {
      map[editor.id] = editor.fullName || editor.firstName;
    });
    return map;
  }, [editors]);

  const formatVersionLabel = useCallback(
    (config: LightAgentConfigurationType) => {
      return config.versionCreatedAt
        ? format(config.versionCreatedAt, "Pp")
        : `v${config.version}`;
    },
    []
  );

  const getAuthorName = useCallback(
    (config: LightAgentConfigurationType) => {
      if (!config.versionAuthorId) {
        return "System";
      }
      return authorMap[config.versionAuthorId] || "Unknown";
    },
    [authorMap]
  );

  const historyWithPrev = useMemo(() => {
    const currentVersion = Math.max(...history.map((h) => h.version));

    const sorted = [...history]
      .filter((config) => config.version !== currentVersion)
      .sort((a, b) =>
        compareDesc(
          a.versionCreatedAt ?? a.version,
          b.versionCreatedAt ?? b.version
        )
      );

    const result: Array<{
      config: LightAgentConfigurationType;
      prevInstructions: string;
    }> = [];

    let lastRawInstructions: string | null = null;

    for (const config of sorted) {
      const instructions = config.instructions ?? "";
      const isNewRun =
        lastRawInstructions === null || instructions !== lastRawInstructions;

      if (isNewRun) {
        const prevInstructions =
          result.length > 0
            ? (result[result.length - 1].config.instructions ?? "")
            : "";

        result.push({
          config,
          prevInstructions,
        });
      } else if (config.version === selectedConfig?.version) {
        const prevInstructions = result[result.length - 1].prevInstructions;
        result[result.length - 1] = {
          config,
          prevInstructions,
        };
      }

      lastRawInstructions = instructions;
    }

    return result;
  }, [history, selectedConfig]);

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

      <DropdownMenuContent
        className="h-96 w-72"
        dropdownHeaders={
          <>
            <DropdownMenuLabel label="Choose version to compare" />
            <DropdownMenuSeparator />
          </>
        }
      >
        {isEditorsLoading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
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
            {historyWithPrev.map(({ config }) => (
              <DropdownMenuRadioItem
                key={config.version}
                value={config.version.toString()}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex flex-col">
                    <span>{formatVersionLabel(config)}</span>
                    <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                      by {getAuthorName(config)}
                    </span>
                  </div>
                </div>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
