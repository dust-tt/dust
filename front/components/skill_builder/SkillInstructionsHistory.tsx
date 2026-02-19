import { useMembersLookup } from "@app/lib/swr/memberships";
import type {
  SkillType,
  SkillWithVersionType,
} from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
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
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useCallback, useMemo } from "react";

interface SkillInstructionsHistoryProps {
  currentSkill: SkillType;
  history: SkillWithVersionType[];
  selectedConfig: SkillWithVersionType | null;
  onSelect: (config: SkillWithVersionType) => void;
  owner: LightWorkspaceType;
}

export function SkillInstructionsHistory({
  currentSkill,
  history,
  onSelect,
  selectedConfig,
  owner,
}: SkillInstructionsHistoryProps) {
  const editedByIdsToLookup = useMemo(() => {
    const ids = new Set<number>();
    history.forEach((config) => {
      if (config.editedBy) {
        ids.add(Number(config.editedBy));
      }
    });

    return Array.from(ids);
  }, [history]);

  const { members: editedByLookupMembers, isMembersLookupLoading } =
    useMembersLookup({
      workspaceId: owner.sId,
      memberIds: editedByIdsToLookup,
      disabled: editedByIdsToLookup.length === 0,
    });

  const editedByUserMap = useMemo(() => {
    const map: Record<string, string> = {};
    editedByLookupMembers.forEach((user) => {
      map[user.id.toString()] = user.fullName || user.firstName || "Unknown";
    });
    return map;
  }, [editedByLookupMembers]);

  const formatVersionLabel = useCallback((config: SkillWithVersionType) => {
    return config.createdAt
      ? format(config.createdAt, "Pp")
      : `Version ${config.version}`;
  }, []);

  const getEditedByName = useCallback(
    (config: SkillType) => {
      if (!config.editedBy) {
        return "System";
      }
      return editedByUserMap[config.editedBy.toString()] || "Unknown";
    },
    [editedByUserMap]
  );

  // Collapse successive versions that contain the exact same instructions,
  // keeping the first one (it's the one with the highest version).
  const historyWithPrev = useMemo(() => {
    const result: SkillWithVersionType[] = [];

    let lastRawInstructions = currentSkill.instructions;

    for (const config of history) {
      const { instructions } = config;
      const isNewRun = instructions !== lastRawInstructions;

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
                      by {getEditedByName(config)}
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
