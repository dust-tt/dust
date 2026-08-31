import type { CommandPaletteItem } from "@app/components/command_palette/CommandPaletteItems";
import {
  ItemRow,
  ItemTitle,
} from "@app/components/command_palette/CommandPaletteItems";
import type {
  CommandGroup,
  CommandPaletteCommand,
} from "@app/components/command_palette/commandPaletteCommands";
import { COMMAND_GROUP_LABELS } from "@app/components/command_palette/commandPaletteCommands";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { getSpaceIcon } from "@app/lib/spaces";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { PodType } from "@app/types/space";
import { Avatar, Icon } from "@dust-tt/sparkle";

export interface CommandGroupSection {
  group: CommandGroup;
  commands: CommandPaletteCommand[];
  // Position of this group's first row in the flat keyboard-navigation order.
  startIndex: number;
}

// Every section is positioned in one shared flat order so the arrow keys can
// walk the whole palette; each row reports its own index back through these.
interface SectionProps {
  selectedIndex: number;
  registerRef: (index: number, el: HTMLDivElement | null) => void;
  onItemSelect: (item: CommandPaletteItem) => void;
  onSelectedIndexChange: (index: number) => void;
}

interface CommandSectionsProps extends SectionProps {
  groups: CommandGroupSection[];
}

export function CommandSections({
  groups,
  selectedIndex,
  registerRef,
  onItemSelect,
  onSelectedIndexChange,
}: CommandSectionsProps) {
  return (
    <>
      {groups.map(({ group, commands, startIndex }) => (
        <div key={group}>
          <ItemTitle>{COMMAND_GROUP_LABELS[group]}</ItemTitle>
          {commands.map((command, i) => {
            const globalIndex = startIndex + i;
            return (
              <ItemRow
                key={command.id}
                ref={(el) => registerRef(globalIndex, el)}
                isSelected={selectedIndex === globalIndex}
                onClick={() => onItemSelect({ kind: "command", command })}
                onMouseMove={() => onSelectedIndexChange(globalIndex)}
              >
                <Icon
                  visual={command.icon}
                  size="xs"
                  className="text-muted-foreground"
                />
                <span className="min-w-0 truncate font-medium">
                  {command.label}
                </span>
              </ItemRow>
            );
          })}
        </div>
      ))}
    </>
  );
}

function MoreAvailable({ label }: { label: string }) {
  return (
    <div className="px-3 py-2 text-xs text-muted-foreground">
      More {label} available. Type to filter.
    </div>
  );
}

interface AgentSectionProps extends SectionProps {
  agents: LightAgentConfigurationType[];
  hasMore: boolean;
  startIndex: number;
}

export function AgentSection({
  agents,
  hasMore,
  startIndex,
  selectedIndex,
  registerRef,
  onItemSelect,
  onSelectedIndexChange,
}: AgentSectionProps) {
  if (agents.length === 0) {
    return null;
  }

  return (
    <div>
      <ItemTitle>Agents</ItemTitle>
      {agents.map((agent, i) => {
        const globalIndex = startIndex + i;
        return (
          <ItemRow
            key={agent.sId}
            ref={(el) => registerRef(globalIndex, el)}
            isSelected={selectedIndex === globalIndex}
            onClick={() => onItemSelect({ kind: "agent", agent })}
            onMouseMove={() => onSelectedIndexChange(globalIndex)}
          >
            <Avatar visual={agent.pictureUrl} size="xs" />
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 font-medium">{agent.name}</span>
              <span className="shrink-0 text-muted-foreground">-</span>
              <span className="min-w-0 truncate text-muted-foreground">
                {agent.description}
              </span>
            </div>
          </ItemRow>
        );
      })}
      {hasMore && <MoreAvailable label="agents" />}
    </div>
  );
}

interface PodSectionProps extends SectionProps {
  pods: PodType[];
  hasMore: boolean;
  startIndex: number;
}

export function PodSection({
  pods,
  hasMore,
  startIndex,
  selectedIndex,
  registerRef,
  onItemSelect,
  onSelectedIndexChange,
}: PodSectionProps) {
  if (pods.length === 0) {
    return null;
  }

  return (
    <div>
      <ItemTitle>Pods</ItemTitle>
      {pods.map((pod, i) => {
        const globalIndex = startIndex + i;
        return (
          <ItemRow
            key={pod.sId}
            ref={(el) => registerRef(globalIndex, el)}
            isSelected={selectedIndex === globalIndex}
            onClick={() => onItemSelect({ kind: "pod", pod })}
            onMouseMove={() => onSelectedIndexChange(globalIndex)}
          >
            <Icon visual={getSpaceIcon(pod)} size="xs" />
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 font-medium">{pod.name}</span>
              {pod.description && (
                <>
                  <span className="shrink-0 text-muted-foreground">-</span>
                  <span className="min-w-0 truncate text-muted-foreground">
                    {pod.description}
                  </span>
                </>
              )}
            </div>
          </ItemRow>
        );
      })}
      {hasMore && <MoreAvailable label="pods" />}
    </div>
  );
}

interface SkillSectionProps extends SectionProps {
  skills: SkillWithoutInstructionsAndToolsType[];
  hasMore: boolean;
  startIndex: number;
}

export function SkillSection({
  skills,
  hasMore,
  startIndex,
  selectedIndex,
  registerRef,
  onItemSelect,
  onSelectedIndexChange,
}: SkillSectionProps) {
  if (skills.length === 0) {
    return null;
  }

  return (
    <div>
      <ItemTitle>Skills</ItemTitle>
      {skills.map((skill, i) => {
        const globalIndex = startIndex + i;
        const SkillAvatar = getSkillAvatarIcon(skill);
        return (
          <ItemRow
            key={skill.sId}
            ref={(el) => registerRef(globalIndex, el)}
            isSelected={selectedIndex === globalIndex}
            onClick={() => onItemSelect({ kind: "skill", skill })}
            onMouseMove={() => onSelectedIndexChange(globalIndex)}
          >
            <SkillAvatar size="xs" />
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 font-medium">{skill.name}</span>
              <span className="shrink-0 text-muted-foreground">-</span>
              <span className="min-w-0 truncate text-muted-foreground">
                {skill.userFacingDescription}
              </span>
            </div>
          </ItemRow>
        );
      })}
      {hasMore && <MoreAvailable label="skills" />}
    </div>
  );
}
