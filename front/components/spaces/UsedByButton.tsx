import { getSkillAvatarIcon } from "@app/lib/skill";
import type {
  SkillUsageType,
  UsedBySkillType,
} from "@app/types/assistant/skill_configuration";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import { pluralize } from "@app/types/shared/utils/string_utils";
import {
  Avatar,
  Button,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PuzzleIcon,
  RobotIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

type UsedByDropdownItem =
  | {
      kind: "agent";
      agent: SkillUsageType["agents"][number];
    }
  | {
      kind: "skill";
      skill: UsedBySkillType;
    };

function getUsedByDropdownItemName(item: UsedByDropdownItem) {
  switch (item.kind) {
    case "agent":
      return item.agent.name;
    case "skill":
      return item.skill.name;
    default:
      return assertNever(item);
  }
}

function getUsedByDropdownItemId(item: UsedByDropdownItem) {
  switch (item.kind) {
    case "agent":
      return item.agent.sId;
    case "skill":
      return item.skill.sId;
    default:
      return assertNever(item);
  }
}

interface SkillDropdownIconProps {
  icon: string | null;
}

function SkillDropdownIcon({ icon }: SkillDropdownIconProps) {
  const SkillAvatar = getSkillAvatarIcon(icon);
  return <SkillAvatar size="xs" />;
}

interface UsedByButtonIconProps {
  agentCount: number;
  skillCount: number;
  showChevron: boolean;
}

function UsedByButtonIcon({
  agentCount,
  skillCount,
  showChevron,
}: UsedByButtonIconProps) {
  const hasAgents = agentCount > 0;
  const hasSkills = skillCount > 0;

  return (
    <span className="mx-0.5 flex h-5 items-center justify-center gap-1.5 leading-none">
      {(hasAgents || !hasSkills) && (
        <span className="inline-flex h-5 items-center gap-1">
          <RobotIcon className="h-4 w-4 shrink-0" />
          <span className="inline-flex h-5 items-center text-sm leading-none tabular-nums">
            {agentCount}
          </span>
        </span>
      )}
      {hasSkills && (
        <span className="inline-flex h-5 items-center gap-1">
          <PuzzleIcon className="h-4 w-4 shrink-0" />
          <span className="inline-flex h-5 items-center text-sm leading-none tabular-nums">
            {skillCount}
          </span>
        </span>
      )}
      <ChevronDownIcon
        className={
          showChevron
            ? "-mr-px h-4 w-4 shrink-0 text-faint"
            : "invisible -mr-px h-4 w-4 shrink-0 text-faint"
        }
      />
    </span>
  );
}

interface UsedByButtonProps {
  usage: SkillUsageType | null;
  onItemClick: (assistantSid: string) => void;
  onSkillClick?: (skillId: string) => void;
}

export const UsedByButton = ({
  usage,
  onItemClick,
  onSkillClick,
}: UsedByButtonProps) => {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const agents = usage?.agents ?? [];
  const skills = usage?.skills ?? [];
  const agentCount = agents.length;
  const skillCount = skills.length;
  const totalCount = agentCount + skillCount;

  const usageLabel =
    removeNulls([
      agentCount > 0 ? `${agentCount} agent${pluralize(agentCount)}` : null,
      skillCount > 0 ? `${skillCount} skill${pluralize(skillCount)}` : null,
    ]).join(" and ") || "0 agents";

  if (totalCount === 0) {
    return (
      <Button
        icon={
          <UsedByButtonIcon agentCount={0} skillCount={0} showChevron={false} />
        }
        variant="ghost-secondary"
        isSelect={false}
        size="xs"
        isRounded
        className="border-0 hover:bg-muted-background hover:text-foreground dark:hover:bg-muted-background-night dark:hover:text-foreground-night"
        aria-label="Used by 0 agents"
        disabled
      />
    );
  }

  const query = searchText.toLowerCase();
  const dropdownItems: UsedByDropdownItem[] = [
    ...agents.map((agent) => ({ kind: "agent" as const, agent })),
    ...skills.map((skill) => ({ kind: "skill" as const, skill })),
  ]
    .filter(
      (item) =>
        query.length === 0 ||
        getUsedByDropdownItemName(item).toLowerCase().includes(query)
    )
    .sort((a, b) => {
      const nameComparison = getUsedByDropdownItemName(a).localeCompare(
        getUsedByDropdownItemName(b),
        undefined,
        { sensitivity: "base" }
      );

      if (nameComparison !== 0) {
        return nameComparison;
      }

      return getUsedByDropdownItemId(a).localeCompare(
        getUsedByDropdownItemId(b)
      );
    });

  const closeMenu = () => {
    setSearchText("");
    setIsOpen(false);
  };

  const onFirstItemClick = () => {
    const firstItem = dropdownItems[0];
    if (!firstItem) {
      return;
    }

    switch (firstItem.kind) {
      case "agent":
        onItemClick(firstItem.agent.sId);
        closeMenu();
        return;
      case "skill":
        onSkillClick?.(firstItem.skill.sId);
        closeMenu();
        return;
      default:
        assertNever(firstItem);
    }
  };

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setSearchText("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          icon={
            <UsedByButtonIcon
              agentCount={agentCount}
              skillCount={skillCount}
              showChevron
            />
          }
          variant="ghost-secondary"
          isSelect={false}
          size="xs"
          isRounded
          className="border-0 hover:bg-muted-background hover:text-foreground dark:hover:bg-muted-background-night dark:hover:text-foreground-night"
          aria-label={`Used by ${usageLabel}`}
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="h-96 w-72"
        align="end"
        onClick={(e) => e.stopPropagation()}
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              autoFocus
              name="search-used-by-agents"
              placeholder={
                skills.length > 0 ? "Search agents and skills" : "Search agents"
              }
              value={searchText}
              onChange={setSearchText}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onFirstItemClick();
                }
              }}
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        {dropdownItems.map((item) => {
          switch (item.kind) {
            case "agent":
              return (
                <DropdownMenuItem
                  key={`assistant-picker-${item.agent.sId}`}
                  icon={() => (
                    <Avatar size="xs" visual={item.agent.pictureUrl} />
                  )}
                  label={item.agent.name}
                  truncateText
                  className="py-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    onItemClick(item.agent.sId);
                    closeMenu();
                  }}
                />
              );
            case "skill":
              return (
                <DropdownMenuItem
                  key={`skill-picker-${item.skill.sId}`}
                  icon={() => <SkillDropdownIcon icon={item.skill.icon} />}
                  label={item.skill.name}
                  truncateText
                  className="py-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSkillClick?.(item.skill.sId);
                    closeMenu();
                  }}
                />
              );
            default:
              return assertNever(item);
          }
        })}
        {dropdownItems.length === 0 && (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            {skills.length > 0 ? "No matches found" : "No agents found"}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
