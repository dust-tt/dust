import {
  Avatar,
  Button,
  ChevronDown,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PuzzlePiece01,
  Robot,
} from "@dust-tt/sparkle";
import { useState } from "react";

import type { SkillUsage } from "../../data/manageSkills";
import { SkillAvatar } from "./skillIcons";
import { pluralize } from "./utils";

type UsedByDropdownItem =
  | {
      kind: "agent";
      sId: string;
      name: string;
      emoji: string;
      backgroundColor: string;
    }
  | {
      kind: "skill";
      sId: string;
      name: string;
      emoji?: undefined;
      backgroundColor?: undefined;
      icon: string | null;
    };

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
          <Robot className="h-4 w-4 shrink-0" />
          <span className="inline-flex h-5 items-center text-sm leading-none tabular-nums">
            {agentCount}
          </span>
        </span>
      )}
      {hasSkills && (
        <span className="inline-flex h-5 items-center gap-1">
          <PuzzlePiece01 className="h-4 w-4 shrink-0" />
          <span className="inline-flex h-5 items-center text-sm leading-none tabular-nums">
            {skillCount}
          </span>
        </span>
      )}
      <ChevronDown
        className={
          showChevron
            ? "-mr-px h-4 w-4 shrink-0 text-faint"
            : "invisible -mr-px h-4 w-4 shrink-0 text-faint"
        }
      />
    </span>
  );
}

// The composite icon (robot + count + chevron) is wider than the icon-only
// fixed width (w-6 on xs); size to content instead.
const USED_BY_BUTTON_CLASSES =
  "w-auto border-0 px-2 hover:bg-muted-background hover:text-foreground";

interface UsedByButtonProps {
  usage: SkillUsage | null;
  onAgentClick: (agentId: string) => void;
  onSkillClick: (skillId: string) => void;
}

export function UsedByButton({
  usage,
  onAgentClick,
  onSkillClick,
}: UsedByButtonProps) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const agents = usage?.agents ?? [];
  const skills = usage?.skills ?? [];
  const agentCount = agents.length;
  const skillCount = skills.length;
  const totalCount = agentCount + skillCount;

  const usageLabel =
    [
      agentCount > 0 ? `${agentCount} agent${pluralize(agentCount)}` : null,
      skillCount > 0 ? `${skillCount} skill${pluralize(skillCount)}` : null,
    ]
      .filter((label): label is string => label !== null)
      .join(" and ") || "0 agents";

  if (totalCount === 0) {
    return (
      <Button
        icon={
          <UsedByButtonIcon agentCount={0} skillCount={0} showChevron={false} />
        }
        variant="ghost-secondary"
        isSelect={false}
        size="xs"
        className={USED_BY_BUTTON_CLASSES}
        aria-label="Used by 0 agents"
        disabled
      />
    );
  }

  const query = searchText.toLowerCase();
  const dropdownItems: UsedByDropdownItem[] = [
    ...agents.map((agent) => ({
      kind: "agent" as const,
      sId: agent.sId,
      name: agent.name,
      emoji: agent.emoji,
      backgroundColor: agent.backgroundColor,
    })),
    ...skills.map((skill) => ({
      kind: "skill" as const,
      sId: skill.sId,
      name: skill.name,
      icon: skill.icon,
    })),
  ]
    .filter(
      (item) => query.length === 0 || item.name.toLowerCase().includes(query)
    )
    .sort((a, b) => {
      const nameComparison = a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
      });
      if (nameComparison !== 0) {
        return nameComparison;
      }
      return a.sId.localeCompare(b.sId);
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
    if (firstItem.kind === "agent") {
      onAgentClick(firstItem.sId);
    } else {
      onSkillClick(firstItem.sId);
    }
    closeMenu();
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
          className={USED_BY_BUTTON_CLASSES}
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
        {dropdownItems.map((item) =>
          item.kind === "agent" ? (
            <DropdownMenuItem
              key={`assistant-picker-${item.sId}`}
              icon={() => (
                <Avatar
                  size="xs"
                  emoji={item.emoji}
                  backgroundColor={item.backgroundColor}
                />
              )}
              label={item.name}
              truncateText
              className="py-1"
              onClick={(e) => {
                e.stopPropagation();
                onAgentClick(item.sId);
                closeMenu();
              }}
            />
          ) : (
            <DropdownMenuItem
              key={`skill-picker-${item.sId}`}
              icon={() => <SkillAvatar icon={item.icon} size="xs" />}
              label={item.name}
              truncateText
              className="py-1"
              onClick={(e) => {
                e.stopPropagation();
                onSkillClick(item.sId);
                closeMenu();
              }}
            />
          )
        )}
        {dropdownItems.length === 0 && (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            {skills.length > 0 ? "No matches found" : "No agents found"}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
