import { getSkillAvatarIcon } from "@app/lib/skill";
import type {
  SkillUsageType,
  UsedBySkillType,
} from "@app/types/assistant/skill_configuration";
import {
  Avatar,
  Button,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PuzzleIcon,
  RobotIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

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
    <span className="inline-flex h-5 items-center justify-center gap-1.5 leading-none">
      {(hasAgents || !hasSkills) && (
        <span className="inline-flex h-5 items-center gap-1">
          <RobotIcon className="h-4 w-4 shrink-0" />
          <span className="inline-flex h-5 items-center text-sm leading-none tabular-nums">
            {agentCount}
          </span>
        </span>
      )}
      {hasAgents && hasSkills && (
        <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
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
          showChevron ? "h-4 w-4 shrink-0" : "invisible h-4 w-4 shrink-0"
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
    agentCount > 0 && skillCount > 0
      ? `${agentCount} agent${agentCount === 1 ? "" : "s"} and ${skillCount} skill${skillCount === 1 ? "" : "s"}`
      : skillCount > 0
        ? `${skillCount} skill${skillCount === 1 ? "" : "s"}`
        : `${agentCount} agent${agentCount === 1 ? "" : "s"}`;

  if (totalCount === 0) {
    return (
      <Button
        icon={
          <UsedByButtonIcon agentCount={0} skillCount={0} showChevron={false} />
        }
        variant="ghost-secondary"
        isSelect={false}
        size="xs"
        className="px-2"
        aria-label="Used by 0 agents"
        disabled
      />
    );
  }

  const query = searchText.toLowerCase();
  const filteredAgents =
    query.length === 0
      ? agents
      : agents.filter((a) => a.name.toLowerCase().includes(query));
  const filteredSkills =
    query.length === 0
      ? skills
      : skills.filter((skill) => skill.name.toLowerCase().includes(query));

  const closeMenu = () => {
    setSearchText("");
    setIsOpen(false);
  };

  const onFirstItemClick = () => {
    const firstAgent = filteredAgents[0];
    if (firstAgent) {
      onItemClick(firstAgent.sId);
      closeMenu();
      return;
    }

    const firstSkill = filteredSkills[0];
    if (firstSkill && onSkillClick) {
      onSkillClick(firstSkill.sId);
      closeMenu();
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
          className="px-2"
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
        {filteredAgents.length > 0 ? (
          <>
            {skills.length > 0 && <DropdownMenuLabel label="Agents" />}
            {filteredAgents.map((agent) => (
              <DropdownMenuItem
                key={`assistant-picker-${agent.sId}`}
                icon={() => <Avatar size="xs" visual={agent.pictureUrl} />}
                label={agent.name}
                truncateText
                className="py-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onItemClick(agent.sId);
                  closeMenu();
                }}
              />
            ))}
          </>
        ) : null}
        {filteredAgents.length > 0 && filteredSkills.length > 0 && (
          <DropdownMenuSeparator />
        )}
        {filteredSkills.length > 0 && (
          <>
            {agents.length > 0 && <DropdownMenuLabel label="Skills" />}
            {filteredSkills.map((skill: UsedBySkillType) => (
              <DropdownMenuItem
                key={`skill-picker-${skill.sId}`}
                icon={() => <SkillDropdownIcon icon={skill.icon} />}
                label={skill.name}
                truncateText
                className="py-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onSkillClick?.(skill.sId);
                  closeMenu();
                }}
              />
            ))}
          </>
        )}
        {filteredAgents.length === 0 && filteredSkills.length === 0 && (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            {skills.length > 0 ? "No matches found" : "No agents found"}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
