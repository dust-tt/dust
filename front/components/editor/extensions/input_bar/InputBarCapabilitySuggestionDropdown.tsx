import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useSkills } from "@app/lib/swr/skill_configurations";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
import type { SuggestionProps } from "@tiptap/suggestion";
import {
  forwardRef,
  type RefObject,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

const MAX_CAPABILITY_SUGGESTIONS = 10;

export function filterInputBarCapabilities({
  query,
  selectedSkillIds,
  skills,
}: {
  query: string;
  selectedSkillIds: Set<string>;
  skills: SkillWithoutInstructionsAndToolsType[];
}) {
  const normalizedQuery = query.trim().toLowerCase();

  return skills
    .filter((skill) => !selectedSkillIds.has(skill.sId))
    .filter((skill) => {
      if (normalizedQuery.length === 0) {
        return true;
      }

      return skill.name.toLowerCase().includes(normalizedQuery);
    })
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_CAPABILITY_SUGGESTIONS);
}

export const InputBarCapabilitySuggestionDropdown = forwardRef<
  SlashCommandDropdownRef,
  Pick<
    SuggestionProps<SkillWithoutInstructionsAndToolsType>,
    "clientRect" | "command" | "query"
  > & {
    onClose: () => void;
    owner: LightWorkspaceType;
    selectedSkillIdsRef: RefObject<Set<string>>;
  }
>(
  (
    { clientRect, command, query, onClose, owner, selectedSkillIdsRef },
    ref
  ) => {
    const dropdownRef = useRef<SlashCommandDropdownRef>(null);
    const { skills, isSkillsLoading } = useSkills({
      owner,
      status: "active",
      globalSpaceOnly: true,
      viewType: "summary",
    });

    const filteredSkills = useMemo(
      () =>
        filterInputBarCapabilities({
          query,
          selectedSkillIds: selectedSkillIdsRef.current ?? new Set<string>(),
          skills,
        }),
      [query, selectedSkillIdsRef, skills]
    );

    const skillItems = useMemo<SlashCommand[]>(
      () =>
        filteredSkills.map((skill) => ({
          action: skill.sId,
          description: skill.userFacingDescription,
          icon: getSkillAvatarIcon(skill.icon),
          id: skill.sId,
          label: skill.name,
          tooltip: skill.userFacingDescription
            ? {
                description: skill.userFacingDescription,
              }
            : undefined,
        })),
      [filteredSkills]
    );

    const skillsById = useMemo(
      () => new Map(filteredSkills.map((skill) => [skill.sId, skill])),
      [filteredSkills]
    );

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (
            (event.key === "Enter" || event.key === "Tab") &&
            (isSkillsLoading || skillItems.length === 0)
          ) {
            event.preventDefault();
            return true;
          }

          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [isSkillsLoading, skillItems.length]
    );

    return (
      <SlashCommandDropdown
        ref={dropdownRef}
        items={skillItems}
        command={(item) => {
          const skill = skillsById.get(item.id);

          if (skill) {
            command(skill);
          }
        }}
        clientRect={clientRect}
        emptyMessage={
          isSkillsLoading ? "Loading capabilities..." : "No capabilities found"
        }
        header="Capabilities"
        onClose={onClose}
      />
    );
  }
);

InputBarCapabilitySuggestionDropdown.displayName =
  "InputBarCapabilitySuggestionDropdown";
