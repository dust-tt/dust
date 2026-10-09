import { CreateAgentDropdown } from "@app/components/assistant/CreateAgentDropdown";
import { InfiniteScroll } from "@app/components/InfiniteScroll";
import {
  useSearchAgents,
  useSearchAgentsInfinite,
} from "@app/hooks/useSearchAgents";
import { MAX_AGENT_SEARCH_RESULTS } from "@app/lib/agent_search/constants";
import { useClientType } from "@app/lib/context/clientType";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { RichAgentMentionCandidate } from "@app/types/assistant/mentions";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  Check,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  LoadingBlock,
  Robot,
  StarFilled,
  XClose,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

function AgentPickerLoadingRows({ count }: { count: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`agent-picker-loading-${i}`}
          className="flex items-center gap-2.5 px-2 py-1"
        >
          <LoadingBlock className="h-7 w-7 shrink-0 rounded-md" />
          <LoadingBlock className={i % 2 === 0 ? "h-4 w-2/3" : "h-4 w-1/2"} />
        </div>
      ))}
    </div>
  );
}

interface AgentPickerProps {
  owner: LightWorkspaceType;
  agents: LightAgentConfigurationType[];
  onItemClick: (agent: RichAgentMentionCandidate) => void;
  onAgentDetailsClick?: (agentId: string) => void;
  pickerButton?: React.ReactNode;
  showDropdownArrow?: boolean;
  showFooterButtons?: boolean;
  side?: "top" | "bottom";
  size?: "xs" | "sm" | "md";
  isLoading?: boolean;
  disabled?: boolean;
  mountPortal?: boolean;
  onOpenChange?: (open: boolean) => void;
  selectedAgentId?: string | null;
  onDeselect?: () => void;
  showFavoritesFirst?: boolean;
}

/**
 * @cc [owner:aubin-tchoi,label:react;product] agent-picker-search-rollout
 * The open, enabled picker MUST search agents in alphabetical order by default.
 * A selected match MUST stay first, including a supplied selection beyond the
 * first search page when the query is blank.
 * With showFavoritesFirst, an empty query MUST show favorites before other agents,
 * preserving each query's alphabetical order without duplicates. Typed queries MUST
 * search all agents by relevance without promoting favorites.
 * Every listed favorite agent MUST show a favorite star, whatever the query.
 */
export function AgentPicker({
  owner,
  agents,
  onItemClick,
  onAgentDetailsClick,
  pickerButton,
  showDropdownArrow = true,
  showFooterButtons = true,
  side,
  size = "md",
  isLoading = false,
  disabled = false,
  onOpenChange,
  selectedAgentId,
  onDeselect,
  showFavoritesFirst = false,
}: AgentPickerProps) {
  const { t } = useLingui();
  const clientType = useClientType();
  const isMobile = useIsMobile();
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const hasQuery = searchText.trim().length > 0;
  const shouldPromoteFavorites = showFavoritesFirst && !hasQuery;

  const {
    agents: allAgents,
    isAgentsLoading: isSearchLoading,
    isAgentsError: isSearchError,
    hasMore,
    isLoadingMore,
    loadMore,
  } = useSearchAgentsInfinite({
    owner,
    searchTerm: searchText,
    limit: MAX_AGENT_SEARCH_RESULTS,
    sortBy: showFavoritesFirst && hasQuery ? "relevance" : "name",
    permissionFiltering: "strict",
    selectionMode: "all",
    disabled: !isOpen || disabled,
  });
  const {
    agents: favoriteAgents,
    isAgentsLoading: isFavoritesLoading,
    isAgentsError: isFavoritesError,
  } = useSearchAgents({
    owner,
    searchTerm: "",
    sortBy: "name",
    permissionFiltering: "strict",
    selectionMode: "favorites_only",
    disabled: !isOpen || disabled,
  });

  // Wait for both lists so favorites do not jump above already displayed results.
  const isAgentsLoading =
    isSearchLoading || (shouldPromoteFavorites && isFavoritesLoading);
  const isAgentsError =
    isSearchError || (shouldPromoteFavorites && isFavoritesError);
  const favoriteIds = new Set(favoriteAgents.map((agent) => agent.sId));
  const searchResults = shouldPromoteFavorites
    ? [
        ...favoriteAgents,
        ...allAgents.filter((agent) => !favoriteIds.has(agent.sId)),
      ]
    : allAgents;
  const selected =
    searchResults.find((a) => a.sId === selectedAgentId) ??
    // Keep the current selection visible even if it is beyond the first search page.
    (!hasQuery ? agents.find((a) => a.sId === selectedAgentId) : undefined);
  const searchedAgents = selected
    ? [selected, ...searchResults.filter((a) => a.sId !== selectedAgentId)]
    : searchResults;

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        onOpenChange?.(open);
        if (open) {
          setSearchText("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        {/* Stable anchor across pickerButton swaps: prevents a top-left flash on close. */}
        <div className="inline-flex">
          {pickerButton ? (
            pickerButton
          ) : (
            <Button
              icon={Robot}
              variant="ghost-secondary"
              isSelect={showDropdownArrow}
              size={size}
              tooltip={t`Pick an agent`}
              disabled={disabled || isLoading}
            />
          )}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="h-96 w-80"
        side={side}
        align="start"
        viewportRef={setScrollRoot}
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              autoFocus={!isMobile}
              name="search-agents"
              placeholder={t`Search for agents`}
              value={searchText}
              onChange={setSearchText}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !isAgentsLoading &&
                  !isAgentsError &&
                  searchedAgents.length > 0
                ) {
                  onItemClick(searchedAgents[0]);
                  setSearchText("");
                  setIsOpen(false);
                }
              }}
              button={
                showFooterButtons && (
                  <CreateAgentDropdown
                    owner={owner}
                    dataGtmLocation="homepage"
                    label={t({
                      message: "Create",
                      context: "verb, button label",
                    })}
                  />
                )
              }
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        {isAgentsLoading ? (
          <div role="status" aria-label={t`Loading agents`}>
            <AgentPickerLoadingRows count={10} />
          </div>
        ) : isAgentsError ? (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            <Trans>Unable to load agents</Trans>
          </div>
        ) : searchedAgents.length > 0 ? (
          <>
            {searchedAgents.map((agent) => {
              const isSelected = agent.sId === selectedAgentId;
              return (
                <DropdownMenuItem
                  key={`agent-picker-${agent.sId}`}
                  icon={() => (
                    <Avatar size="xs" visual={agent.pictureUrl} lazyLoad />
                  )}
                  label={agent.name}
                  truncateText
                  className={`group py-1 notranslate ${
                    isSelected ? "bg-primary-100" : ""
                  }`}
                  endComponent={
                    <div className="z-10 flex items-center gap-1">
                      {favoriteIds.has(agent.sId) && (
                        <Icon
                          visual={StarFilled}
                          size="xs"
                          className="text-muted-foreground"
                        />
                      )}
                      {isSelected && (
                        // Show a tick by default; on hover swap it for an X to
                        // signal that clicking will deselect the agent.
                        <>
                          <Icon
                            visual={Check}
                            size="sm"
                            className="group-hover:hidden"
                          />
                          <Icon
                            visual={XClose}
                            size="sm"
                            className="hidden group-hover:block"
                          />
                        </>
                      )}
                      {onAgentDetailsClick && clientType !== "extension" ? (
                        <Button
                          icon={DotsHorizontal}
                          variant="outline"
                          size="xmini"
                          className="opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onAgentDetailsClick(agent.sId);
                            setIsOpen(false);
                          }}
                        />
                      ) : undefined}
                    </div>
                  }
                  onClick={() => {
                    // Clicking the selected agent deselects it; keep the picker
                    // open so a different agent can be chosen right away.
                    if (isSelected) {
                      onDeselect?.();
                      return;
                    }
                    onItemClick(agent);
                    setSearchText("");
                    setIsOpen(false);
                  }}
                  onSelect={isSelected ? (e) => e.preventDefault() : undefined}
                />
              );
            })}
            {scrollRoot && (
              <InfiniteScroll
                nextPage={loadMore}
                hasMore={hasMore}
                options={{ root: scrollRoot }}
                showLoader={isLoadingMore}
                loader={<AgentPickerLoadingRows count={3} />}
              />
            )}
          </>
        ) : (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            <Trans>No results found</Trans>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
