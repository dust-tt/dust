import { getSkillAvatarIcon } from "@app/lib/skill";
import type {
  SkillUsageType,
  UsedBySkillType,
} from "@app/types/assistant/skill_configuration";
import {
  Avatar,
  Button,
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

function SkillDropdownIcon({ icon }: { icon: string | null }) {
  const SkillAvatar = getSkillAvatarIcon(icon);
  return <SkillAvatar size="xs" />;
}

function UsedByButtonIcon() {
  return (
    <span className="flex items-center gap-0.5">
      <RobotIcon className="h-3 w-3" />
      <span className="text-[10px] leading-none">/</span>
      <PuzzleIcon className="h-3 w-3" />
    </span>
  );
}

export const UsedByButton = ({
  usage,
  onItemClick,
  onSkillClick,
}: {
  usage: SkillUsageType | null;
  onItemClick: (assistantSid: string) => void;
  onSkillClick?: (skillId: string) => void;
}) => {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const agentCount = usage?.count ?? 0;
  const skillCount = usage?.skills?.length ?? 0;
  const totalCount = agentCount + skillCount;

  if (totalCount === 0) {
    return (
      <Button
        icon={<UsedByButtonIcon />}
        variant="ghost-secondary"
        isSelect={false}
        size="xs"
        label="0"
        disabled
      />
    );
  }

  const query = searchText.toLowerCase();
  const agents = usage?.agents ?? [];
  const skills = usage?.skills ?? [];
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
          icon={<UsedByButtonIcon />}
          variant="ghost-secondary"
          isSelect
          size="xs"
          label={`${totalCount}`}
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
