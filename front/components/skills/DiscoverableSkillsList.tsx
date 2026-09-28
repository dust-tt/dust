import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useSearchSkills, useSkills } from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Spinner, Tooltip } from "@dust-tt/sparkle";
import { useState } from "react";

const DISCOVERABLE_SKILLS_PAGE_SIZE = 50;

interface DiscoverableSkillsListProps {
  owner: LightWorkspaceType;
}

export function DiscoverableSkillsList({ owner }: DiscoverableSkillsListProps) {
  const { hasFeature } = useFeatureFlags();
  const useSkillSearch = hasFeature("skills_search");
  const [pageIndex, setPageIndex] = useState(0);

  const { skills: listedSkills, isSkillsLoading: isListedSkillsLoading } =
    useSkills({
      owner,
      status: "active",
      availability: "users_and_agents",
      disabled: useSkillSearch,
    });
  const {
    skills: searchSkills,
    isSkillsLoading: isSearchSkillsLoading,
    hasMore,
  } = useSearchSkills({
    owner,
    searchTerm: "",
    offset: pageIndex * DISCOVERABLE_SKILLS_PAGE_SIZE,
    limit: DISCOVERABLE_SKILLS_PAGE_SIZE,
    filters: { availability: ["users_and_agents"] },
    disabled: !useSkillSearch,
  });
  const discoverableSkills = useSkillSearch ? searchSkills : listedSkills;
  const isDiscoverableLoading = useSkillSearch
    ? isSearchSkillsLoading
    : isListedSkillsLoading;

  return (
    <div className="flex flex-col gap-4">
      <div className="heading-lg text-foreground">Discoverable Skills</div>
      {/* Keep the current page visible while the next page loads. */}
      {isDiscoverableLoading && discoverableSkills.length === 0 ? (
        <div className="flex flex-row items-center gap-2">
          <Spinner size="xs" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {discoverableSkills.map((s) => {
            const SkillAvatar = getSkillAvatarIcon(s);
            return (
              <Tooltip
                key={s.sId}
                label={s.userFacingDescription}
                trigger={
                  <div className="flex flex-row items-center gap-2">
                    <SkillAvatar size="xs" />
                    <div className="truncate">{s.name}</div>
                  </div>
                }
                tooltipTriggerAsChild
              />
            );
          })}
        </div>
      )}
      {useSkillSearch && (pageIndex > 0 || hasMore) && (
        <div className="flex items-center gap-2">
          <Button
            label="Previous"
            variant="outline"
            size="sm"
            disabled={pageIndex === 0 || isDiscoverableLoading}
            onClick={() => setPageIndex((index) => index - 1)}
          />
          <Button
            label="Next"
            variant="outline"
            size="sm"
            disabled={!hasMore || isDiscoverableLoading}
            isLoading={isDiscoverableLoading}
            onClick={() => setPageIndex((index) => index + 1)}
          />
        </div>
      )}
    </div>
  );
}
