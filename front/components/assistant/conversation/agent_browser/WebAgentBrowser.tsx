import { CreateDropdown } from "@app/components/assistant/CreateDropdown";
import { ManageDropdownMenu } from "@app/components/assistant/ManageDropdownMenu";
import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import { useAppRouter } from "@app/lib/platform";
import { SKILL_ICON } from "@app/lib/skill";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import {
  getAgentBuilderRoute,
  getSkillBuilderRoute,
  setQueryParam,
} from "@app/lib/utils/router";
import {
  Button,
  ContactsRobot,
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
  const { hasPermission } = useWorkspacePermissions();

  const canCreateAgent = hasPermission("create", "agent");
  const canPublishAgent = hasPermission("publish", "agent");
  // Users who can publish agents can reach the manage agents page to discover
  // existing agents and edit the ones they can, even without create permission.
  const canManageAgents = canCreateAgent || canPublishAgent;
  const canCreateSkill = hasPermission("create", "skill");

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
          trackAgentBrowserEvents
        />

        <div className="hidden sm:block">
          <div className="flex gap-2">
            {canCreateAgent && (
              <div ref={createAgentButtonRef}>
                <CreateDropdown owner={owner} dataGtmLocation="homepage" />
              </div>
            )}
            {canManageAgents && canCreateSkill ? (
              <ManageDropdownMenu owner={owner} />
            ) : canManageAgents ? (
              <Button
                href={getAgentBuilderRoute(owner.sId, "manage")}
                variant="primary"
                icon={ContactsRobot}
                label="Manage agents"
                data-gtm-label="assistantManagementButton"
                data-gtm-location="homepage"
                size="sm"
                onClick={withTracking(TRACKING_AREAS.BUILDER, "manage_agents")}
              />
            ) : canCreateSkill ? (
              <Button
                href={getSkillBuilderRoute(owner.sId, "manage")}
                variant="primary"
                icon={SKILL_ICON}
                label="Manage skills"
                size="sm"
              />
            ) : null}
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
          trackAgentBrowserEvents
        />
      ) : (
        viewTab && (
          <AgentGrid
            agentConfigurations={agentsByTab[viewTab]}
            handleAssistantClick={handleAgentClick}
            handleMoreClick={setDisplayedAssistantId}
            owner={owner}
            trackAgentBrowserEvents
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
