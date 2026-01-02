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
import type { LightWorkspaceType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

interface SkillInstructionsHistoryProps {
  history: SkillType[];
  selectedConfig: SkillType | null;
  onSelect: (config: SkillType) => void;
  owner: LightWorkspaceType;
}

export function SkillInstructionsHistory({
  history,
  onSelect,
  selectedConfig,
  owner,
}: SkillInstructionsHistoryProps) {
  const authorIdsToLookup = useMemo(() => {
    const ids = new Set<number>();
    history.forEach((config) => {
      if (config.authorId) {
        ids.add(Number(config.authorId));
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

  const formatVersionLabel = useCallback((config: SkillType) => {
    return config.createdAt
      ? format(config.createdAt, "Pp")
      : `Version ${config.id}`;
  }, []);

  const getAuthorName = useCallback(
    (config: SkillType) => {
      if (!config.authorId) {
        return "System";
      }
      return authorMap[config.authorId.toString()] || "Unknown";
    },
    [authorMap]
  );

  const historyWithPrev = useMemo(() => {
    // Get current version (first item, since it's sorted DESC by version)
    const currentVersionId = history[0]?.id;

    const sorted = [...history]
      .filter((config) => config.id !== currentVersionId)
      .sort((a, b) => compareDesc(a.createdAt ?? a.id, b.createdAt ?? b.id));

    const result: Array<{
      config: SkillType;
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
      } else if (config.id === selectedConfig?.id) {
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
        {isMembersLookupLoading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <DropdownMenuRadioGroup
            value={selectedConfig?.id.toString() ?? ""}
            onValueChange={(selectedValue) => {
              const config = history.find(
                (c) => c.id.toString() === selectedValue
              );
              if (config) {
                onSelect(config);
              }
            }}
          >
            {historyWithPrev.map(({ config }) => (
              <DropdownMenuRadioItem
                key={config.id}
                value={config.id.toString()}
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
