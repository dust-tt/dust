import { compareStrings } from "@app/lib/i18n/format";
import { getSkillAvatarIcon } from "@app/lib/skill";
import type { UsedBySkillType } from "@app/types/assistant/skill_configuration";
import type {
  AgentsAndSkillsUsageType,
  AgentsUsageType,
} from "@app/types/data_source";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
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
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

type UsedByDropdownItem =
  | {
      kind: "agent";
      agent: AgentsAndSkillsUsageType["agents"][number];
    }
  | {
      kind: "skill";
      skill: UsedBySkillType;
    };

function getUsedByDropdownItemName(item: UsedByDropdownItem): string {
  switch (item.kind) {
    case "agent":
      return item.agent.name;
    case "skill":
      return item.skill.name;
  }
}

function getUsedByDropdownItemId(item: UsedByDropdownItem): string {
  switch (item.kind) {
    case "agent":
      return item.agent.sId;
    case "skill":
      return item.skill.sId;
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
  usage: AgentsUsageType | AgentsAndSkillsUsageType | null;
  onItemClick: (assistantId: string) => void;
  onSkillClick?: (skillId: string) => void;
}

export function UsedByButton({
  usage,
  onItemClick,
  onSkillClick,
}: UsedByButtonProps) {
  const { t } = useLingui();
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const agents = usage?.agents ?? [];
  const skills = usage && "skills" in usage ? usage.skills : [];
  const agentCount = agents.length;
  const skillCount = skills.length;
  const totalCount = agentCount + skillCount;

  const usageLabel =
    agentCount > 0 && skillCount > 0
      ? t`Used by ${plural(agentCount, { one: "# agent", other: "# agents" })} and ${plural(skillCount, { one: "# skill", other: "# skills" })}`
      : skillCount > 0
        ? t`${plural(skillCount, { one: "Used by # skill", other: "Used by # skills" })}`
        : t`${plural(agentCount, { one: "Used by # agent", other: "Used by # agents" })}`;

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
        aria-label={usageLabel}
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
      const nameComparison = compareStrings(
        getUsedByDropdownItemName(a),
        getUsedByDropdownItemName(b),
        { sensitivity: "base" }
      );

      if (nameComparison !== 0) {
        return nameComparison;
      }

      return compareStrings(
        getUsedByDropdownItemId(a),
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
        assertNeverAndIgnore(firstItem);
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
          className={USED_BY_BUTTON_CLASSES}
          aria-label={usageLabel}
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
                skills.length > 0
                  ? t`Search agents and skills`
                  : t`Search agents`
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
              assertNeverAndIgnore(item);
              return null;
          }
        })}
        {dropdownItems.length === 0 && (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            {skills.length > 0 ? t`No matches found` : t`No agents found`}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
