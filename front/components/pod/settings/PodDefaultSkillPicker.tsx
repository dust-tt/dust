import { CapabilitiesPickerItemsList } from "@app/components/assistant/CapabilitiesPicker";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useSearchSkills } from "@app/lib/swr/skill_configurations";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ChevronDown,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  ShapesPlus,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface PodDefaultSkillPickerProps {
  owner: LightWorkspaceType;
  skills: SkillWithoutInstructionsAndToolsType[];
  selectedSkillIds: string[];
  onSelect: (skillId: string) => void;
  triggerClassName: string;
}

export function PodDefaultSkillPicker({
  owner,
  skills,
  selectedSkillIds,
  onSelect,
  triggerClassName,
}: PodDefaultSkillPickerProps) {
  const { hasFeature } = useFeatureFlags();
  const useSkillSearch = hasFeature("skills_search");
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const {
    skills: searchSkills,
    isSkillsLoading,
    hasMore,
    nextCursor,
  } = useSearchSkills({
    owner,
    searchTerm,
    cursor: cursors.at(-1),
    disabled: !isOpen || !useSkillSearch,
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const selectedIds = new Set(selectedSkillIds);
  const matchingSkills = useSkillSearch
    ? searchSkills
    : skills
        .filter(
          (skill) =>
            skill.name.toLowerCase().includes(normalizedSearch) ||
            skill.userFacingDescription.toLowerCase().includes(normalizedSearch)
        )
        .toSorted((a, b) => a.name.localeCompare(b.name));
  const addableSkills = matchingSkills.filter(
    (skill) => !selectedIds.has(skill.sId)
  );

  const changeSearch = (query: string) => {
    setSearchTerm(query);
    setCursors([null]);
  };

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          changeSearch("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Add a default skill"
          className={triggerClassName}
        >
          <Icon visual={ShapesPlus} size="xs" />
          <span className="grow truncate">Add skill</span>
          <Icon visual={ChevronDown} size="xs" className="-mr-1 text-faint" />
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
              value={searchTerm}
              onChange={changeSearch}
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        {/* Keep the previous results visible while the next query loads. */}
        {isSkillsLoading && matchingSkills.length === 0 ? (
          <div className="flex justify-center p-4">
            <Spinner size="sm" />
          </div>
        ) : addableSkills.length > 0 || !useSkillSearch || !hasMore ? (
          <CapabilitiesPickerItemsList
            emptyMessage={
              normalizedSearch ? "No skills found" : "No more skills to add"
            }
            items={addableSkills.map((skill) => {
              const SkillAvatar = getSkillAvatarIcon(skill);
              return {
                kind: "skill" as const,
                skill,
                id: `pod-default-skills-picker-${skill.sId}`,
                icon: <SkillAvatar size="xs" />,
                label: skill.name,
                sortName: skill.name.toLowerCase(),
                description: skill.userFacingDescription,
              };
            })}
            onItemSelect={(item) => {
              if (item.kind === "skill") {
                onSelect(item.skill.sId);
              }
            }}
          />
        ) : null}
        {useSkillSearch && (cursors.length > 1 || hasMore) && (
          <div className="flex items-center justify-between gap-2 p-2">
            <Button
              label="Previous"
              variant="outline"
              size="sm"
              disabled={cursors.length === 1 || isSkillsLoading}
              onClick={() => setCursors((previous) => previous.slice(0, -1))}
            />
            <Button
              label="Next"
              variant="outline"
              size="sm"
              disabled={!hasMore || isSkillsLoading}
              isLoading={isSkillsLoading}
              onClick={() =>
                setCursors((previous) => [...previous, nextCursor])
              }
            />
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
