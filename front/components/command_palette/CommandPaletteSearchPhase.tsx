import {
  ItemEmptyState,
  ItemRow,
  ItemTitle,
  KeyboardHints,
} from "@app/components/command_palette/CommandPaletteItems";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { getSpaceIcon } from "@app/lib/spaces";
import type { AgentSearchListItemType } from "@app/types/agent_search/agent_search";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import type {
  SkillListItemType,
  SkillWithoutInstructionsAndToolsType,
} from "@app/types/assistant/skill_configuration";
import type { PodType } from "@app/types/space";
import type { LightUserTypeWithWorkspace } from "@app/types/user";
import {
  Avatar,
  cn,
  Icon,
  LoadingBlock,
  MessageCircle01,
  SearchInput,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef } from "react";

type CommandPaletteSkill =
  | SkillListItemType
  | SkillWithoutInstructionsAndToolsType;

type CommandPaletteAgent =
  | LightAgentConfigurationType
  | AgentSearchListItemType;

type CommandPalettePod = PodType & { isMember: boolean };

type CommandPaletteConversation = ConversationListItemType & {
  spaceName: string | null;
};

export type CommandPaletteMember = LightUserTypeWithWorkspace;

export type CommandPaletteItem =
  | { kind: "agent"; agent: CommandPaletteAgent }
  | { kind: "conversation"; conversation: CommandPaletteConversation }
  | { kind: "member"; member: CommandPaletteMember }
  | { kind: "pod"; pod: CommandPalettePod }
  | { kind: "skill"; skill: CommandPaletteSkill };

interface CommandPaletteSearchPhaseProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  agents: CommandPaletteAgent[];
  conversations: CommandPaletteConversation[];
  members: CommandPaletteMember[];
  pods: CommandPalettePod[];
  skills: CommandPaletteSkill[];
  hasMoreAgents: boolean;
  hasMoreConversations: boolean;
  hasMoreMembers: boolean;
  hasMorePods: boolean;
  hasMoreSkills: boolean;
  isLoading: boolean;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onItemSelect: (item: CommandPaletteItem) => void;
  onClose: () => void;
}

function getFlatItems(
  conversations: CommandPaletteConversation[],
  pods: CommandPalettePod[],
  agents: CommandPaletteAgent[],
  members: CommandPaletteMember[],
  skills: CommandPaletteSkill[]
): CommandPaletteItem[] {
  return [
    ...conversations.map(
      (conversation): CommandPaletteItem => ({
        kind: "conversation",
        conversation,
      })
    ),
    ...pods.map((pod): CommandPaletteItem => ({ kind: "pod", pod })),
    ...agents.map((agent): CommandPaletteItem => ({ kind: "agent", agent })),
    ...members.map(
      (member): CommandPaletteItem => ({ kind: "member", member })
    ),
    ...skills.map((skill): CommandPaletteItem => ({ kind: "skill", skill })),
  ];
}

export function CommandPaletteSearchPhase({
  searchQuery,
  onSearchQueryChange,
  agents,
  conversations,
  members,
  pods,
  skills,
  hasMoreAgents,
  hasMoreConversations,
  hasMoreMembers,
  hasMorePods,
  hasMoreSkills,
  isLoading,
  selectedIndex,
  onSelectedIndexChange,
  onItemSelect,
  onClose,
}: CommandPaletteSearchPhaseProps) {
  const flatItems = useMemo(
    () => getFlatItems(conversations, pods, agents, members, skills),
    [conversations, pods, agents, members, skills]
  );
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search input on mount. Deferred with requestAnimationFrame
  // to run after Radix FocusScope has finished trapping focus.
  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Scroll selected item into view. Guard against selectedIndex being
  // transiently out-of-bounds on the render cycle before the reset effect fires.
  useEffect(() => {
    if (selectedIndex < flatItems.length) {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, flatItems.length]);

  // Keep keyboard selection valid when the result list shrinks (e.g. typing).
  useEffect(() => {
    itemRefs.current.length = flatItems.length;
    onSelectedIndexChange(0);
  }, [flatItems.length, onSelectedIndexChange]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const totalItems = flatItems.length;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (totalItems > 0) {
          onSelectedIndexChange((selectedIndex + 1) % totalItems);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (totalItems > 0) {
          onSelectedIndexChange((selectedIndex - 1 + totalItems) % totalItems);
        }
        break;
      case "Enter":
        e.preventDefault();
        if (flatItems[selectedIndex]) {
          onItemSelect(flatItems[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }

  const podsOffset = conversations.length;
  const agentsOffset = podsOffset + pods.length;
  const membersOffset = agentsOffset + agents.length;
  const skillsOffset = membersOffset + members.length;

  return (
    <div className="flex flex-col">
      <div className="border-b border-separator p-3">
        <SearchInput
          ref={searchInputRef}
          name="command-palette-search"
          placeholder="Search…"
          value={searchQuery}
          onChange={onSearchQueryChange}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="flex max-h-125 flex-col gap-2 overflow-y-auto p-1.5">
        {isLoading && flatItems.length === 0 && (
          <div className="flex flex-col gap-1 p-1">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
                <LoadingBlock className="h-6 w-6 shrink-0 rounded-full" />
                <LoadingBlock
                  className="h-4"
                  style={{ width: `${30 + (i % 3) * 20}%` }}
                />
              </div>
            ))}
          </div>
        )}
        {!isLoading && flatItems.length === 0 && searchQuery.length > 0 && (
          <ItemEmptyState>No results found.</ItemEmptyState>
        )}
        {!isLoading && flatItems.length === 0 && searchQuery.length === 0 && (
          <ItemEmptyState>
            Type to search conversations, pods, agents, members and skills.
          </ItemEmptyState>
        )}

        {conversations.length > 0 && (
          <div>
            <ItemTitle>Conversations</ItemTitle>
            {conversations.map((conversation, i) => {
              const title = getConversationDisplayTitle(conversation);
              return (
                <ItemRow
                  key={conversation.sId}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  isSelected={selectedIndex === i}
                  onClick={() =>
                    onItemSelect({ kind: "conversation", conversation })
                  }
                  onMouseMove={() => onSelectedIndexChange(i)}
                >
                  <Icon visual={MessageCircle01} size="xs" />
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate font-medium">
                      {title}
                    </span>
                    {conversation.spaceName && (
                      <>
                        <span className="shrink-0 text-muted-foreground">
                          -
                        </span>
                        <span className="min-w-0 truncate text-muted-foreground">
                          {conversation.spaceName}
                        </span>
                      </>
                    )}
                  </div>
                </ItemRow>
              );
            })}
            {hasMoreConversations && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                More conversations available. Type to filter.
              </div>
            )}
          </div>
        )}

        {pods.length > 0 && (
          <div>
            <ItemTitle>Pods</ItemTitle>
            {pods.map((pod, i) => {
              const globalIndex = podsOffset + i;
              return (
                <ItemRow
                  key={pod.sId}
                  ref={(el) => {
                    itemRefs.current[globalIndex] = el;
                  }}
                  isSelected={selectedIndex === globalIndex}
                  onClick={() => onItemSelect({ kind: "pod", pod })}
                  onMouseMove={() => onSelectedIndexChange(globalIndex)}
                >
                  <Icon visual={getSpaceIcon(pod)} size="xs" />
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        "shrink-0 font-medium",
                        !pod.isMember && "italic"
                      )}
                    >
                      {pod.name}
                    </span>
                    {pod.description && (
                      <>
                        <span className="shrink-0 text-muted-foreground">
                          -
                        </span>
                        <span className="min-w-0 truncate text-muted-foreground">
                          {pod.description}
                        </span>
                      </>
                    )}
                  </div>
                </ItemRow>
              );
            })}
            {hasMorePods && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                More pods available. Type to filter.
              </div>
            )}
          </div>
        )}

        {agents.length > 0 && (
          <div>
            <ItemTitle>Agents</ItemTitle>
            {agents.map((agent, i) => {
              const globalIndex = agentsOffset + i;
              return (
                <ItemRow
                  key={agent.sId}
                  ref={(el) => {
                    itemRefs.current[globalIndex] = el;
                  }}
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
            {hasMoreAgents && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                More agents available. Type to filter.
              </div>
            )}
          </div>
        )}

        {members.length > 0 && (
          <div>
            <ItemTitle>Members</ItemTitle>
            {members.map((member, i) => {
              const globalIndex = membersOffset + i;
              return (
                <ItemRow
                  key={member.sId}
                  ref={(el) => {
                    itemRefs.current[globalIndex] = el;
                  }}
                  isSelected={selectedIndex === globalIndex}
                  onClick={() => onItemSelect({ kind: "member", member })}
                  onMouseMove={() => onSelectedIndexChange(globalIndex)}
                >
                  <Avatar
                    name={member.fullName}
                    visual={member.image ?? undefined}
                    size="xs"
                    isRounded
                  />
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 font-medium">
                      {member.fullName}
                    </span>
                    {member.email && (
                      <>
                        <span className="shrink-0 text-muted-foreground">
                          -
                        </span>
                        <span className="min-w-0 truncate text-muted-foreground">
                          {member.email}
                        </span>
                      </>
                    )}
                  </div>
                </ItemRow>
              );
            })}
            {hasMoreMembers && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                More members available. Type to filter.
              </div>
            )}
          </div>
        )}

        {skills.length > 0 && (
          <div>
            <ItemTitle>Skills</ItemTitle>
            {skills.map((skill, i) => {
              const globalIndex = skillsOffset + i;
              const SkillAvatar = getSkillAvatarIcon(skill);
              return (
                <ItemRow
                  key={skill.sId}
                  ref={(el) => {
                    itemRefs.current[globalIndex] = el;
                  }}
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
            {hasMoreSkills && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                More skills available. Type to filter.
              </div>
            )}
          </div>
        )}
      </div>
      <KeyboardHints
        hints={[
          { keys: ["↑", "↓"], label: "Navigate" },
          { keys: ["↵"], label: "Select" },
          { keys: ["Esc"], label: "Close" },
        ]}
      />
    </div>
  );
}
