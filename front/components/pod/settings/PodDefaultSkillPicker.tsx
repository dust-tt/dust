import { CapabilitiesPickerItemsList } from "@app/components/assistant/CapabilitiesPicker";
import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { useSearchSkillsInfinite } from "@app/hooks/useSearchSkillsInfinite";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { compareStrings } from "@app/lib/i18n/format";
import { getSkillAvatarIcon } from "@app/lib/skill";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ChevronDown,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Icon,
  PuzzlePiece01,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

const SKILL_SEARCH_PAGE_SIZE = 100;

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
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const {
    skills: searchSkills,
    isSkillsLoading,
    hasMore,
    loadMore,
  } = useSearchSkillsInfinite({
    owner,
    searchTerm,
    limit: SKILL_SEARCH_PAGE_SIZE,
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
        .toSorted((a, b) => compareStrings(a.name, b.name));
  const addableSkills = matchingSkills.filter(
    (skill) => !selectedIds.has(skill.sId)
  );

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setSearchTerm("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Add a default skill"
          className={triggerClassName}
        >
          <Icon visual={PuzzlePiece01} size="xs" />
          <span className="grow truncate">Add skill</span>
          <Icon visual={ChevronDown} size="xs" className="-mr-1 text-faint" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-80"
        align="start"
        viewportRef={setScrollRoot}
        dropdownHeaders={
          <DropdownMenuSearchbar
            name="search-default-skills"
            placeholder="Search skills"
            value={searchTerm}
            onChange={setSearchTerm}
          />
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
        {/* Recheck after each page, including pages with only selected skills. */}
        {useSkillSearch && scrollRoot && (
          <InfiniteScroll
            key={searchSkills.length}
            nextPage={loadMore}
            hasMore={hasMore}
            options={{ root: scrollRoot }}
            showLoader={isSkillsLoading && matchingSkills.length > 0}
            loader={
              <div className="flex justify-center p-2">
                <Spinner size="sm" />
              </div>
            }
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
