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
import React, { useCallback, useMemo } from "react";

import { useMembersLookup } from "@app/lib/swr/memberships";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";

interface AgentInstructionsHistoryProps {
  history: LightAgentConfigurationType[];
  selectedConfig: LightAgentConfigurationType | null;
  onSelect: (config: LightAgentConfigurationType) => void;
  owner: LightWorkspaceType;
}

export function AgentInstructionsHistory({
  history,
  onSelect,
  selectedConfig,
  owner,
}: AgentInstructionsHistoryProps) {
  const authorIdsToLookup = useMemo(() => {
    const ids = new Set<number>();
    history.forEach((config) => {
      if (config.versionAuthorId) {
        ids.add(Number(config.versionAuthorId));
      }
    });

    return Array.from(ids);
  }, [history]);

  const { members: authorLookupMembers, isMembersLookupLoading } =
    useMembersLookup({
      workspaceId: owner.sId,
      memberIds: authorIdsToLookup,
      disabled: authorIdsToLookup.length === 0,
    });

  const authorMap = useMemo(() => {
    const map: Record<string, string> = {};
    authorLookupMembers.forEach((user) => {
      map[user.id.toString()] = user.fullName || user.firstName || "Unknown";
    });
    return map;
  }, [authorLookupMembers]);

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
      return authorMap[config.versionAuthorId.toString()] || "Unknown";
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

    const result: LightAgentConfigurationType[] = [];

    let lastRawInstructions: string | null = null;

    for (const config of sorted) {
      const instructions = config.instructions ?? "";
      const isNewRun =
        lastRawInstructions === null || instructions !== lastRawInstructions;

      if (isNewRun) {
        result.push(config);
      } else if (config.version === selectedConfig?.version) {
        result[result.length - 1] = config;
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
        {isMembersLookupLoading ? (
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
            {historyWithPrev.map((config) => (
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
