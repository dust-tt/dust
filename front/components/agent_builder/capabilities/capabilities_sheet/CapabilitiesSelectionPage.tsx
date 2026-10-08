import { SkillCard } from "@app/components/agent_builder/capabilities/capabilities_sheet/SkillCard";
import { MCPServerCard } from "@app/components/agent_builder/capabilities/mcp/MCPServerSelectionPage";
import type { SheetState } from "@app/components/agent_builder/skills/types";
import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { CapabilityFilterButtons } from "@app/components/shared/tools_picker/CapabilityFilterButtons";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { CapabilityFilterType } from "@app/components/shared/tools_picker/types";
import type { SkillListItemType } from "@app/types/assistant/skill_configuration";
import { Card, LoadingBlock, SearchInput } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";

interface CapabilitiesSelectionPageProps {
  onStateChange: (state: SheetState) => void;
  handleSkillToggle: (skill: SkillListItemType) => void;
  filteredSkills: SkillListItemType[];
  skillPagination: {
    hasMore: boolean;
    loadMore: () => void;
    loadedCount: number;
  };
  searchQuery: string;
  resolvedSearchQuery: string;
  selectedSkillIds: Set<string>;
  setSearchQuery: (query: string) => void;
  isCapabilitiesLoading: boolean;
  filteredMCPServerViews: {
    topViews: MCPServerViewTypeWithLabel[];
    nonTopViews: MCPServerViewTypeWithLabel[];
  };
  selectedMCPServerViewIds: Set<string>;
  handleToolToggle: (view: MCPServerViewTypeWithLabel) => void;
  handleToolInfoClick: (view: MCPServerViewTypeWithLabel) => void;
}

// Mirrors the section heading rendered above each card grid.
function CapabilitySectionHeadingLoading() {
  return (
    <div aria-hidden="true">
      <div className="flex h-7 items-center">
        <LoadingBlock className="h-5 w-16" />
      </div>
      <div className="flex h-5 items-center">
        <LoadingBlock className="h-4 w-3/4" />
      </div>
    </div>
  );
}

interface CapabilityCardsLoadingProps {
  count: number;
  // Height of the cards being loaded, matching SkillCard (h-36) or MCPServerCard (h-30).
  cardContainerClassName: string;
}

// Mirrors the ActionCard layout: icon and label row, two description lines and footer link.
function CapabilityCardsLoading({
  count,
  cardContainerClassName,
}: CapabilityCardsLoadingProps) {
  return (
    <div className="grid grid-cols-2 gap-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Card
          key={`capability-card-loading-${i}`}
          className="p-3"
          containerClassName={cardContainerClassName}
        >
          <div className="flex h-full w-full flex-col justify-between">
            <div className="flex flex-col">
              <div className="mb-2 flex items-center gap-2">
                <LoadingBlock className="h-7 w-7 shrink-0 rounded-lg" />
                <LoadingBlock
                  className={i % 2 === 0 ? "h-4 w-28" : "h-4 w-20"}
                />
              </div>
              <div className="flex h-4 items-center">
                <LoadingBlock className="h-3 w-full" />
              </div>
              <div className="flex h-4 items-center">
                <LoadingBlock
                  className={i % 2 === 0 ? "h-3 w-2/3" : "h-3 w-1/2"}
                />
              </div>
            </div>
            <div className="flex h-4 items-center">
              <LoadingBlock className="h-3 w-20" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function CapabilitiesSelectionPageContent({
  handleSkillToggle,
  filteredSkills,
  searchQuery,
  resolvedSearchQuery,
  selectedSkillIds,
  setSearchQuery,
  isCapabilitiesLoading,
  skillPagination,
  filteredMCPServerViews,
  selectedMCPServerViewIds,
  handleToolToggle,
  handleToolInfoClick,
  onStateChange,
}: CapabilitiesSelectionPageProps) {
  const { t } = useLingui();
  const [filter, setFilter] = useState<CapabilityFilterType>("all");

  const sortedMCPServerViews = useMemo(
    () => [
      // Show top views first
      ...filteredMCPServerViews.topViews,
      ...filteredMCPServerViews.nonTopViews,
    ],
    [filteredMCPServerViews.topViews, filteredMCPServerViews.nonTopViews]
  );

  const showSkillsSection = filter === "all" || filter === "skills";
  const showToolsSection = filter === "all" || filter === "tools";

  const hasSkills = filteredSkills.length > 0;
  const hasTools = sortedMCPServerViews.length > 0;

  const hasAnyResults =
    (showSkillsSection && hasSkills) || (showToolsSection && hasTools);

  return (
    <div className="flex flex-col gap-4 pt-1">
      <SearchInput
        placeholder={t`Search capabilities...`}
        value={searchQuery}
        onChange={setSearchQuery}
        name="capability-search"
      />

      <CapabilityFilterButtons filter={filter} setFilter={setFilter} />

      {/* Keep the displayed results while the next search is loading. */}
      {isCapabilitiesLoading && !hasAnyResults ? (
        <>
          <CapabilitySectionHeadingLoading />
          <CapabilityCardsLoading
            count={6}
            cardContainerClassName={filter === "tools" ? "h-30" : "h-36"}
          />
        </>
      ) : !hasAnyResults &&
        !(filter === "skills" && skillPagination.hasMore) ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="px-4 text-center">
            <div className="mb-2 text-lg font-medium text-foreground">
              {searchQuery ? (
                <Trans>No capability matches your search</Trans>
              ) : (
                <Trans>No capabilities available</Trans>
              )}
            </div>
            <div className="max-w-sm text-muted-foreground">
              {searchQuery ? (
                <Trans>Try a different search term.</Trans>
              ) : (
                <Trans>
                  Add tools or create skills to enhance your agents.
                </Trans>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {showSkillsSection && hasSkills && (
            <>
              <div>
                <span className="text-lg font-semibold">
                  <Trans>Skills</Trans>
                </span>
                <p className="text-sm text-muted-foreground">
                  <Trans>
                    Reusable packages of instructions and tools that enable
                    agents to perform specialized tasks.
                  </Trans>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {filteredSkills.map((skill) => (
                  <SkillCard
                    key={skill.sId}
                    skill={skill}
                    isSelected={selectedSkillIds.has(skill.sId)}
                    onClick={() => handleSkillToggle(skill)}
                    onMoreInfoClick={() =>
                      onStateChange({
                        state: "info",
                        kind: "skill",
                        skillId: skill.sId,
                        hasPreviousPage: true,
                      })
                    }
                  />
                ))}
              </div>
            </>
          )}

          {showToolsSection && hasTools && (
            <>
              <div>
                <span className="text-lg font-semibold">
                  <Trans>Tools</Trans>
                </span>
                <p className="text-sm text-muted-foreground">
                  <Trans>
                    Tools that allow agents to retrieve data and take actions.
                  </Trans>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {sortedMCPServerViews.map((view) => (
                  <MCPServerCard
                    key={view.id}
                    view={view}
                    isSelected={selectedMCPServerViewIds.has(view.sId)}
                    onClick={() => handleToolToggle(view)}
                    onToolInfoClick={() => handleToolInfoClick(view)}
                  />
                ))}
              </div>
            </>
          )}
          {filter === "skills" && (
            // Recheck after every page, even when all its skills are already added.
            <InfiniteScroll
              key={`${resolvedSearchQuery}:${skillPagination.loadedCount}`}
              nextPage={skillPagination.loadMore}
              hasMore={skillPagination.hasMore}
              showLoader={isCapabilitiesLoading}
              loader={
                <CapabilityCardsLoading
                  count={2}
                  cardContainerClassName="h-36"
                />
              }
            />
          )}
        </>
      )}
    </div>
  );
}
