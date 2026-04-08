import { CreateDropdown } from "@app/components/assistant/CreateDropdown";
import { ManageDropdownMenu } from "@app/components/assistant/ManageDropdownMenu";
import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { getAgentBuilderRoute, setQueryParam } from "@app/lib/utils/router";
import { isBuilder } from "@app/types/user";
import {
  Button,
  ContactsRobotIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ScrollArea,
  ScrollBar,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

import {
  AGENTS_TABS,
  AgentBrowserSearchDropdown,
  AgentGrid,
  AllTabContent,
  useTagClick,
  type WebAgentBrowserProps,
} from "./shared";

export function WebAgentBrowser({
  owner,
  isLoading,
  handleAgentClick,
  assistantSearch,
  setAssistantSearch,
  filteredTags,
  filteredAgents,
  agentsByTab,
  viewTab,
  setSelectedTab,
  uniqueTags,
  noTagsDefined,
  selectedTag,
  setSelectedTag,
  setDisplayedAssistantId,
  sortType,
  setSortType,
}: WebAgentBrowserProps) {
  const router = useAppRouter();
  const { createAgentButtonRef } = useWelcomeTourGuide();
  const { featureFlags } = useFeatureFlags();

  const isRestrictedFromAgentCreation =
    featureFlags.includes("disallow_agent_creation_to_users") &&
    !isBuilder(owner);

  const sortTypeLabel = useMemo(() => {
    switch (sortType) {
      case "popularity":
        return "By popularity";
      case "alphabetical":
        return "Alphabetical";
      case "updated":
        return "Recently updated";
    }
  }, [sortType]);

  const handleTagClick = useTagClick(
    setSelectedTab,
    setAssistantSearch,
    setSelectedTag
  );

  return (
    <>
      {/* Search bar */}
      <div
        id="search-container"
        className="mb-2 flex w-full flex-row items-center justify-center gap-2 align-middle"
      >
        <AgentBrowserSearchDropdown
          assistantSearch={assistantSearch}
          setAssistantSearch={setAssistantSearch}
          filteredTags={filteredTags}
          filteredAgents={filteredAgents}
          isLoading={isLoading}
          onTagClick={handleTagClick}
          onAgentClick={(agent) => {
            handleAgentClick(agent);
            setAssistantSearch("");
          }}
          onAgentMoreClick={(agentId) =>
            setQueryParam(router, "agentDetails", agentId)
          }
        />

        <div className="hidden sm:block">
          <div className="flex gap-2">
            {!isRestrictedFromAgentCreation && (
              <div ref={createAgentButtonRef}>
                <CreateDropdown owner={owner} dataGtmLocation="homepage" />
              </div>
            )}
            {isBuilder(owner) ? (
              <ManageDropdownMenu owner={owner} />
            ) : (
              <Button
                href={getAgentBuilderRoute(owner.sId, "manage")}
                variant="primary"
                icon={ContactsRobotIcon}
                label="Manage agents"
                data-gtm-label="assistantManagementButton"
                data-gtm-location="homepage"
                size="sm"
                onClick={withTracking(TRACKING_AREAS.BUILDER, "manage_agents")}
              />
            )}
          </div>
        </div>
      </div>

      {/* Agent tabs */}
      <div className="w-full">
        <ScrollArea aria-orientation="horizontal">
          <Tabs value={viewTab} onValueChange={setSelectedTab}>
            <TabsList>
              {AGENTS_TABS.map((tab) => (
                <TabsTrigger
                  disabled={agentsByTab[tab.id].length === 0}
                  key={tab.id}
                  value={tab.id}
                  label={tab.label}
                />
              ))}
              <div className="ml-auto"></div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    isSelect
                    variant="outline"
                    label={sortTypeLabel}
                    size="sm"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    label="By popularity"
                    onClick={() => setSortType("popularity")}
                  />
                  <DropdownMenuItem
                    label="Alphabetical"
                    onClick={() => setSortType("alphabetical")}
                  />
                  <DropdownMenuItem
                    label="Recently updated"
                    onClick={() => setSortType("updated")}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </TabsList>
          </Tabs>
          <ScrollBar orientation="horizontal" className="hidden" />
        </ScrollArea>
      </div>

      {/* Content */}
      {viewTab === "all" ? (
        <AllTabContent
          noTagsDefined={noTagsDefined}
          uniqueTags={uniqueTags}
          selectedTag={selectedTag}
          setSelectedTag={setSelectedTag}
          agentsByTab={agentsByTab}
          handleAgentClick={handleAgentClick}
          setDisplayedAssistantId={setDisplayedAssistantId}
          owner={owner}
          showTagHeadings={true}
        />
      ) : (
        viewTab && (
          <AgentGrid
            agentConfigurations={agentsByTab[viewTab]}
            handleAssistantClick={handleAgentClick}
            handleMoreClick={setDisplayedAssistantId}
            owner={owner}
          />
        )
      )}

      {isLoading && (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      )}
    </>
  );
}
