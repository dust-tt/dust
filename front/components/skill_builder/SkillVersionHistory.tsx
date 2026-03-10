import type { MCPServerViewType } from "@app/lib/api/mcp";
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
import { useMemo } from "react";

interface SkillVersionHistoryProps {
  currentSkill: SkillType;
  history: SkillWithVersionType[];
  selectedConfig: SkillWithVersionType | null;
  onSelect: (config: SkillWithVersionType) => void;
  owner: LightWorkspaceType;
}

export function SkillVersionHistory({
  currentSkill,
  history,
  onSelect,
  selectedConfig,
  owner,
}: SkillVersionHistoryProps) {
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

  function formatVersionLabel(config: SkillWithVersionType): string {
    return config.createdAt
      ? format(config.createdAt, "Pp")
      : `Version ${config.version}`;
  }

  function getEditedByName(config: SkillType): string {
    if (!config.editedBy) {
      return "System";
    }
    return editedByUserMap[config.editedBy.toString()] || "Unknown";
  }

  // Collapse successive versions where all comparable fields are identical,
  // keeping the first occurrence (highest version number).
  const deduplicatedHistory = useMemo(() => {
    const result: SkillWithVersionType[] = [];

    let lastFingerprint = getVersionFingerprint(currentSkill);

    for (const config of history) {
      const fingerprint = getVersionFingerprint(config);
      const isNew = fingerprint !== lastFingerprint;

      if (isNew) {
        result.push(config);
      } else if (config.version === selectedConfig?.version) {
        result[result.length - 1] = config;
      }

      lastFingerprint = fingerprint;
    }

    return result;
  }, [history, selectedConfig, currentSkill]);

  const triggerLabel = selectedConfig
    ? formatVersionLabel(selectedConfig)
    : "History";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          icon={HistoryIcon}
          size="sm"
          label={triggerLabel}
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
            {deduplicatedHistory.map((config) => (
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

function getVersionFingerprint(skill: SkillType): string {
  return JSON.stringify({
    instructions: skill.instructions,
    agentFacingDescription: skill.agentFacingDescription,
    tools: skill.tools.map((t: MCPServerViewType) => t.sId).sort(),
    files: skill.fileAttachments.map((f) => f.fileId).sort(),
  });
}
