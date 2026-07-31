import type {
  MentionDropdownOnKeyDown,
  MentionDropdownProps,
} from "@app/components/editor/input_bar/types";
import { useConversationParticipants } from "@app/hooks/conversations/useConversationParticipants";
import {
  filterAndSortEditorSuggestionAgents,
  filterEditorSuggestionUsers,
  interleaveMentionsPreservingAgentOrder,
} from "@app/lib/mentions/editor/suggestion";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useMentionSuggestions } from "@app/lib/swr/mentions";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { RichAgentMentionInConversation } from "@app/types/assistant/mentions";
import {
  isRichUserMention,
  toRichAgentMentionType,
} from "@app/types/assistant/mentions";
import {
  Avatar,
  Chip,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import type React from "react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

export const MentionDropdown = forwardRef<
  MentionDropdownOnKeyDown,
  MentionDropdownProps
>(
  (
    {
      query,
      clientRect,
      command,
      onClose,
      owner,
      conversationId,
      spaceId,
      includeCurrentUser,
      select,
    },
    ref
  ) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Call clientRect() on every render to get the latest position.
    // This avoids caching stale coordinates that may be invalid (0,0) when typing @ quickly after refresh.
    const triggerRect = clientRect?.();

    const { agentConfigurations, isLoading: areAgentsLoading } =
      useUnifiedAgentConfigurations({
        workspaceId: owner.sId,
        disabled: !select.agents,
      });
    const { conversationParticipants } = useConversationParticipants({
      workspaceId: owner.sId,
      conversationId,
      options: { disabled: !select.agents || !conversationId },
    });
    const {
      suggestions: serverSuggestions,
      isLoading: areUsersLoading,
      isSearching: isUserSearchInProgress,
    } = useMentionSuggestions({
      workspaceId: owner.sId,
      conversationId,
      spaceId,
      query,
      select: { agents: false, users: select.users },
      includeCurrentUser,
      disabled: !select.users,
    });

    const lowerCaseQuery = query.toLowerCase();
    const agentSuggestions = useMemo(() => {
      if (!select.agents) {
        return [];
      }

      const participantAgentsById = new Map(
        (conversationParticipants?.agents ?? []).map((agent) => [
          agent.configurationId,
          agent,
        ])
      );
      const activeAgents: RichAgentMentionInConversation[] = [];
      for (const agent of agentConfigurations) {
        if (agent.status !== "active") {
          continue;
        }

        const participant = participantAgentsById.get(agent.sId);
        activeAgents.push({
          ...toRichAgentMentionType(agent),
          isParticipant: participant !== undefined,
          lastActivityAt: participant?.lastActivityAt,
        });
      }

      const sidekickParticipant = participantAgentsById.get(
        GLOBAL_AGENTS_SID.SIDEKICK
      );
      const candidates =
        sidekickParticipant &&
        !activeAgents.some((agent) => agent.id === GLOBAL_AGENTS_SID.SIDEKICK)
          ? [
              ...activeAgents,
              {
                type: "agent" as const,
                id: sidekickParticipant.configurationId,
                label: sidekickParticipant.name,
                pictureUrl: sidekickParticipant.pictureUrl,
                description: "",
                isParticipant: true,
                lastActivityAt: sidekickParticipant.lastActivityAt,
              },
            ]
          : activeAgents;

      return filterAndSortEditorSuggestionAgents(lowerCaseQuery, candidates);
    }, [
      agentConfigurations,
      conversationParticipants?.agents,
      lowerCaseQuery,
      select.agents,
    ]);
    const userSuggestions = useMemo(
      () =>
        filterEditorSuggestionUsers(
          lowerCaseQuery,
          serverSuggestions.filter(isRichUserMention)
        ),
      [lowerCaseQuery, serverSuggestions]
    );
    const suggestions = useMemo(
      () =>
        interleaveMentionsPreservingAgentOrder(
          agentSuggestions,
          userSuggestions,
          lowerCaseQuery,
          null,
          conversationId
        ),
      [agentSuggestions, conversationId, lowerCaseQuery, userSuggestions]
    );
    const isLoading =
      suggestions.length === 0 &&
      ((areAgentsLoading && agentConfigurations.length === 0) ||
        areUsersLoading ||
        isUserSearchInProgress);

    const selectedItemRef = useRef<HTMLDivElement>(null);

    const selectItem = (index: number) => {
      const item = suggestions[index];

      if (item) {
        command(item);
      }
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex(
            (selectedIndex + suggestions.length - 1) % suggestions.length
          );
          return true;
        }

        if (event.key === "ArrowDown") {
          if (suggestions.length === 0) {
            return false;
          }
          setSelectedIndex((selectedIndex + 1) % suggestions.length);
          return true;
        }

        if (event.key === "Enter" || event.key === "Tab" || event.key === " ") {
          if (suggestions.length === 0) {
            return false;
          }
          selectItem(selectedIndex);
          return true;
        }

        return false;
      },
    }));

    // Reset the selected index when items change (e.g., when query changes).
    // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
    useEffect(() => {
      setSelectedIndex(0);
    }, [suggestions]);

    // Scroll selected item into view when selection changes.
    // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
    useEffect(() => {
      if (selectedItemRef.current) {
        selectedItemRef.current.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }, [selectedIndex]);

    // Only render the dropdown if we have a valid trigger.
    if (!triggerRect) {
      return null;
    }

    // Don't render the dropdown if there are no results
    if (suggestions.length === 0 && !isLoading) {
      return null;
    }

    const virtualTriggerStyle: React.CSSProperties = {
      position: "fixed",
      left: triggerRect.left,
      // On iOS based browsers, the position is not correct without adding the offsetTop.
      // Something related to the position calculation when there is a scrollable area.
      top:
        triggerRect.top +
        (typeof window === "undefined"
          ? 0
          : (window.visualViewport?.offsetTop ?? 0)),
      width: 1,
      height: triggerRect.height || 1,
      pointerEvents: "none",
      zIndex: -1,
      padding: 0,
      minWidth: 0,
      border: "none",
      background: "transparent",
    };

    return (
      <DropdownMenu open={true}>
        <DropdownMenuTrigger asChild>
          <div style={virtualTriggerStyle} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-72"
          align="start"
          side="bottom"
          sideOffset={4}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={() => {
            onClose?.();
          }}
          onInteractOutside={() => {
            onClose?.();
          }}
        >
          {isLoading ? (
            <div className="flex h-12 w-full items-center justify-center">
              <Spinner />
            </div>
          ) : suggestions.length > 0 ? (
            <div className="max-h-60">
              {suggestions.map((suggestion, index) => (
                <DropdownMenuItem
                  key={suggestion.id}
                  ref={index === selectedIndex ? selectedItemRef : null}
                  className={cn(
                    index === selectedIndex
                      ? "text-highlight-500"
                      : "text-foreground"
                  )}
                  onClick={() => {
                    selectItem(index);
                  }}
                  onMouseEnter={() => {
                    setSelectedIndex(index);
                  }}
                >
                  <div className="flex w-full items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-x-2">
                      <Avatar
                        size="xs"
                        visual={suggestion.pictureUrl}
                        isRounded={suggestion.type === "user"}
                      />
                      <span
                        className="truncate font-semibold"
                        title={suggestion.label}
                      >
                        {suggestion.label}
                      </span>
                    </div>
                    {suggestion.type === "user" && (
                      <Chip
                        size="mini"
                        color="primary"
                        label="Member"
                        className="ml-2 shrink-0"
                      />
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </div>
          ) : (
            <div className="flex h-12 w-full items-center justify-center text-sm text-muted-foreground">
              No result
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

MentionDropdown.displayName = "MentionDropdown";
