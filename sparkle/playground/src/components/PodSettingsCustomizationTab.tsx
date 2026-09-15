import {
  Avatar,
  Button,
  ChevronDown,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  ShapesPlus,
  TextArea,
  XCircle,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import { useMemo, useState } from "react";

import {
  DUST_DEFAULT_AGENT,
  mockAgents,
  mockSkills,
  POD_AGENTS_MD_FILENAME,
  POD_AGENTS_MD_MAX_CHARACTER_COUNT,
} from "../data";
import { PodCustomizationSection } from "./PodCustomizationSection";
import type { PodTabCustomization } from "./podSettingsShared";

// Mirrors the pill used for the default agent / skills in the conversation
// input bar, so the same selection reads identically in both places.
const DEFAULT_PILL_BASE_CLASSNAME =
  "inline-flex box-border w-fit items-center rounded-xl h-9 px-3 gap-2 border border-border bg-background text-sm text-primary transition-colors duration-200";
const DEFAULT_PILL_INTERACTIVE_CLASSNAME =
  "cursor-pointer hover:bg-primary-100 hover:border-primary-150";

export interface PodSettingsCustomizationTabProps {
  instructions: string;
  onInstructionsChange: (instructions: string) => void;
  defaultAgentId: string | null;
  onDefaultAgentIdChange: (agentId: string | null) => void;
  defaultSkillIds: string[];
  onDefaultSkillIdsChange: (skillIds: string[]) => void;
  podTabCustomization?: PodTabCustomization;
}

export function PodSettingsCustomizationTab({
  instructions,
  onInstructionsChange,
  defaultAgentId,
  onDefaultAgentIdChange,
  defaultSkillIds,
  onDefaultSkillIdsChange,
  podTabCustomization,
}: PodSettingsCustomizationTabProps) {
  // ── Instructions for agents ─────────────────────────────────────────────
  const [instructionsDraft, setInstructionsDraft] = useState(instructions);
  const isInstructionsDirty = instructionsDraft !== instructions;
  const isInstructionsTooLong =
    instructionsDraft.length > POD_AGENTS_MD_MAX_CHARACTER_COUNT;

  // ── Default agent ───────────────────────────────────────────────────────
  const agents = useMemo(() => [DUST_DEFAULT_AGENT, ...mockAgents], []);
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);
  const [agentSearchText, setAgentSearchText] = useState("");
  const defaultAgent =
    agents.find((agent) => agent.id === defaultAgentId) ?? DUST_DEFAULT_AGENT;
  const normalizedAgentSearch = agentSearchText.trim().toLowerCase();
  const pickableAgents = agents
    .filter(
      (agent) =>
        normalizedAgentSearch.length === 0 ||
        agent.name.toLowerCase().includes(normalizedAgentSearch) ||
        agent.description.toLowerCase().includes(normalizedAgentSearch)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  // ── Default skills ──────────────────────────────────────────────────────
  const [isSkillPickerOpen, setIsSkillPickerOpen] = useState(false);
  const [skillSearchText, setSkillSearchText] = useState("");
  const selectedDefaultSkills = defaultSkillIds.flatMap((skillId) => {
    const skill = mockSkills.find((item) => item.id === skillId);
    return skill ? [skill] : [];
  });
  const normalizedSkillSearch = skillSearchText.trim().toLowerCase();
  const addableSkills = mockSkills
    .filter(
      (skill) =>
        !defaultSkillIds.includes(skill.id) &&
        (normalizedSkillSearch.length === 0 ||
          skill.name.toLowerCase().includes(normalizedSkillSearch) ||
          skill.description.toLowerCase().includes(normalizedSkillSearch))
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {/* Tabs */}
      {podTabCustomization && (
        <PodCustomizationSection
          tabs={podTabCustomization.tabs}
          addableFiles={podTabCustomization.addableFiles}
          onReorder={podTabCustomization.onReorder}
          onChangeIcon={podTabCustomization.onChangeIcon}
          onRename={podTabCustomization.onRename}
          onRemove={podTabCustomization.onRemove}
          onAdd={podTabCustomization.onAdd}
        />
      )}

      {/* Instructions for Agents */}
      <div className="flex w-full flex-col gap-2">
        <div className="heading-lg">Pod instructions for Agents</div>
        <div className="text-sm text-muted-foreground">
          Seen by all agents in this Pod, stored as{" "}
          <span className="font-medium">{POD_AGENTS_MD_FILENAME}</span> in the
          Pod's files.
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2">
          {isInstructionsTooLong && (
            <ContentMessage
              title="Content exceeds the character limit"
              variant="warning"
              className="w-full"
            >
              This file is longer than {POD_AGENTS_MD_MAX_CHARACTER_COUNT}{" "}
              characters. You can read and edit it, but trim it down before
              saving.
            </ContentMessage>
          )}
          <TextArea
            value={instructionsDraft}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setInstructionsDraft(e.target.value)
            }
            placeholder="Enter instructions for agents"
            minRows={10}
            resize="vertical"
            className="min-h-60"
          />
          <div className="flex items-center justify-end text-xs text-muted-foreground">
            {instructionsDraft.length} / {POD_AGENTS_MD_MAX_CHARACTER_COUNT}
          </div>
          {isInstructionsDirty && (
            <div className="flex gap-2">
              <Button
                label="Save"
                variant="highlight"
                disabled={isInstructionsTooLong}
                onClick={() => onInstructionsChange(instructionsDraft)}
              />
              <Button
                label="Cancel"
                variant="outline"
                onClick={() => setInstructionsDraft(instructions)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Default agent */}
      <div className="flex w-full flex-col gap-2">
        <div className="heading-lg">Default agent</div>
        <p className="text-sm text-muted-foreground">
          The agent pre-selected when anyone starts a new conversation in this
          Pod.
        </p>
        <div className="flex items-center gap-2">
          <DropdownMenu
            open={isAgentPickerOpen}
            onOpenChange={(open) => {
              setIsAgentPickerOpen(open);
              if (open) {
                setAgentSearchText("");
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <div
                role="button"
                tabIndex={0}
                aria-label={`Default Agent: ${defaultAgent.name}`}
                className={cn(
                  DEFAULT_PILL_BASE_CLASSNAME,
                  DEFAULT_PILL_INTERACTIVE_CLASSNAME
                )}
              >
                <Avatar
                  size="xs"
                  emoji={defaultAgent.emoji}
                  backgroundColor={defaultAgent.backgroundColor}
                  isRounded={false}
                />
                <span className="grow truncate">{defaultAgent.name}</span>
                <Icon
                  visual={ChevronDown}
                  size="xs"
                  className="-mr-1 text-faint"
                />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-80"
              align="start"
              dropdownHeaders={
                <>
                  <DropdownMenuSearchbar
                    name="search-default-agent"
                    placeholder="Search agents"
                    value={agentSearchText}
                    onChange={setAgentSearchText}
                  />
                  <DropdownMenuSeparator />
                </>
              }
            >
              {pickableAgents.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                  No agents found
                </div>
              ) : (
                pickableAgents.map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    label={agent.name}
                    description={agent.description}
                    truncateText
                    icon={
                      <Avatar
                        size="xs"
                        emoji={agent.emoji}
                        backgroundColor={agent.backgroundColor}
                        isRounded={false}
                      />
                    }
                    onClick={() => onDefaultAgentIdChange(agent.id)}
                  />
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {defaultAgentId !== null && (
            <Button
              variant="ghost"
              size="sm"
              icon={XCircle}
              tooltip="Reset to the default agent"
              onClick={() => onDefaultAgentIdChange(null)}
            />
          )}
        </div>
      </div>

      {/* Default Skills */}
      <div className="flex w-full flex-col gap-2">
        <div className="heading-lg">Default Skills</div>
        <p className="text-sm text-muted-foreground">
          The skills pre-selected when anyone starts a new conversation in this
          Pod. Members can still edit the skills in each conversation.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {selectedDefaultSkills.map((skill) => (
            <div
              key={skill.id}
              aria-label={`Default skill: ${skill.name}`}
              className={DEFAULT_PILL_BASE_CLASSNAME}
            >
              <Avatar size="xs" icon={skill.icon} />
              <span className="grow truncate">{skill.name}</span>
              <button
                type="button"
                aria-label={`Remove ${skill.name}`}
                className="-mr-1 flex items-center text-faint hover:text-primary"
                onClick={() =>
                  onDefaultSkillIdsChange(
                    defaultSkillIds.filter((id) => id !== skill.id)
                  )
                }
              >
                <Icon visual={XCircle} size="xs" />
              </button>
            </div>
          ))}
          <DropdownMenu
            open={isSkillPickerOpen}
            onOpenChange={(open) => {
              setIsSkillPickerOpen(open);
              if (open) {
                setSkillSearchText("");
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Add a default skill"
                className={cn(
                  DEFAULT_PILL_BASE_CLASSNAME,
                  DEFAULT_PILL_INTERACTIVE_CLASSNAME
                )}
              >
                <Icon visual={ShapesPlus} size="xs" />
                <span className="grow truncate">Add skill</span>
                <Icon
                  visual={ChevronDown}
                  size="xs"
                  className="-mr-1 text-faint"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-80"
              align="start"
              dropdownHeaders={
                <>
                  <DropdownMenuSearchbar
                    name="search-default-skills"
                    placeholder="Search skills"
                    value={skillSearchText}
                    onChange={setSkillSearchText}
                  />
                  <DropdownMenuSeparator />
                </>
              }
            >
              {addableSkills.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                  {normalizedSkillSearch.length > 0
                    ? "No skills found"
                    : "No more skills to add"}
                </div>
              ) : (
                addableSkills.map((skill) => (
                  <DropdownMenuItem
                    key={skill.id}
                    label={skill.name}
                    description={skill.description}
                    truncateText
                    icon={<Avatar size="xs" icon={skill.icon} />}
                    onClick={() =>
                      onDefaultSkillIdsChange([...defaultSkillIds, skill.id])
                    }
                  />
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
}
