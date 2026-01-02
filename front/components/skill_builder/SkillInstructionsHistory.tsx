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
import { format } from "date-fns/format";
import React, { useCallback, useMemo } from "react";

import { useMembersLookup } from "@app/lib/swr/memberships";
import type { LightWorkspaceType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

interface SkillInstructionsHistoryProps {
  currentSkill: SkillType;
  history: SkillType[];
  selectedConfig: SkillType | null;
  onSelect: (config: SkillType) => void;
  owner: LightWorkspaceType;
}

export function SkillInstructionsHistory({
  currentSkill,
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
      : `Version ${config.version}`;
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

  // Collapse successive versions that contain the exact same instructions,
  // keeping the first one (it's the one with the highest version).
  const historyWithPrev = useMemo(() => {
    const result: SkillType[] = [];

    let lastRawInstructions = currentSkill.instructions;

    for (const config of history) {
      const { instructions } = config;
      const isNewRun = instructions !== lastRawInstructions;
      console.log({
        isNewRun,
        lastRawInstructions,
        instructions,
        version: config.version,
      });

      if (isNewRun) {
        result.push(config);
      } else if (config.version === selectedConfig?.version) {
        result[result.length - 1] = config;
      }

      lastRawInstructions = instructions;
    }

    return result;
  }, [history, selectedConfig, currentSkill]);

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
