import type { AgentBrowserSharedProps } from "@app/components/assistant/conversation/agent_browser/shared";
import {
  AGENTS_TABS,
  AgentBrowserSearchDropdown,
  AgentGrid,
  AllTabContent,
  useTagClick,
} from "@app/components/assistant/conversation/agent_browser/shared";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";

export function MobileOrExtensionAgentBrowser({
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
}: AgentBrowserSharedProps) {
  const handleTagClick = useTagClick(
    setSelectedTab,
    setAssistantSearch,
    setSelectedTag
  );

  return (
    <>
      {/* Navigation */}
      <div className="w-full flex flex-row gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              isSelect
              variant="outline"
              label={
                viewTab
                  ? AGENTS_TABS.find((tab) => tab.id === viewTab)?.label
                  : "Select view"
              }
              size="sm"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {AGENTS_TABS.map((tab) => (
              <DropdownMenuItem
                key={tab.id}
                disabled={agentsByTab[tab.id].length === 0}
                onClick={() => setSelectedTab(tab.id)}
                label={tab.label}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
        />
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
          showTagHeadings={false}
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
