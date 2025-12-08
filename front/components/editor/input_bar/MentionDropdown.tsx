import {
  Avatar,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  MentionDropdownOnKeyDown,
  MentionDropdownProps,
} from "@app/components/editor/input_bar/types";
import { useConversationParticipants } from "@app/lib/swr/conversations";
import { useMentionSuggestions } from "@app/lib/swr/mentions";
import { useUser } from "@app/lib/swr/user";
import { classNames } from "@app/lib/utils";

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
      preferredAgentId,
    },
    ref
  ) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const triggerRect = useMemo(
      () => (clientRect ? clientRect() : null),
      [clientRect]
    );

    // Fetch suggestions from server using the query.
    const { suggestions, isLoading } = useMentionSuggestions({
      workspaceId: owner.sId,
      conversationId,
      query,
      select: { agents: true, users: true },
    });

    const triggerRef = useRef<HTMLDivElement>(null);
    const [virtualTriggerStyle, setVirtualTriggerStyle] =
      useState<React.CSSProperties>({});
    const selectedItemRef = useRef<HTMLButtonElement>(null);

    const { conversationParticipants } = useConversationParticipants({
      conversationId,
      workspaceId: owner.sId,
      options: { disabled: !conversationId },
    });

    const { user } = useUser();

    const orderedSuggestions = useMemo(() => {
      let base = suggestions;

      // Promote conversation participants first (up to 5) by explicitly
      // injecting them into the list (in case they weren't returned by the
      // global suggestion endpoint), then append other suggestions.
      if (conversationParticipants) {
        const normalizedQuery = query.trim().toLowerCase();
        const matchesQuery = (label: string) =>
          !normalizedQuery || label.toLowerCase().includes(normalizedQuery);

        const participantUsers = conversationParticipants.users
          .filter((u) => u.sId !== user?.sId)
          .map((u) => ({
            type: "user" as const,
            id: u.sId,
            label: u.fullName ?? u.username,
            pictureUrl: u.pictureUrl ?? "/static/humanavatar/anonymous.png",
            description: u.username,
          }))
          .filter((m) => matchesQuery(m.label));

        const participantAgents = conversationParticipants.agents
          .map((a) => ({
            type: "agent" as const,
            id: a.configurationId,
            label: a.name,
            pictureUrl: a.pictureUrl,
            description: "",
            userFavorite: false,
          }))
          .filter((m) => matchesQuery(m.label));

        const key = (m: { type: string; id: string }) => `${m.type}:${m.id}`;
        const existingKeys = new Set(base.map(key));

        const MAX_TOP_PARTICIPANTS = 5;
        const MAX_TOP_USERS = 3;

        const newUserParticipants = participantUsers.filter(
          (m) => !existingKeys.has(key(m))
        );
        const cappedUserParticipants = newUserParticipants.slice(
          0,
          MAX_TOP_USERS
        );

        const remainingSlots =
          MAX_TOP_PARTICIPANTS - cappedUserParticipants.length;

        const newAgentParticipants = participantAgents.filter(
          (m) => !existingKeys.has(key(m))
        );
        const cappedAgentParticipants =
          remainingSlots > 0
            ? newAgentParticipants.slice(0, remainingSlots)
            : [];

        const cappedParticipants = [
          ...cappedUserParticipants,
          ...cappedAgentParticipants,
        ];

        base = [...cappedParticipants, ...base];
      }

      // Then move the preferred agent (last used) to the very first position if present.
      if (!preferredAgentId) {
        return base;
      }
      const preferredIndex = base.findIndex(
        (s) => s.type === "agent" && s.id === preferredAgentId
      );
      if (preferredIndex <= 0) {
        return base;
      }
      const preferred = base[preferredIndex];
      return [preferred, ...base.filter((_, i) => i !== preferredIndex)];
    }, [suggestions, preferredAgentId, conversationParticipants, query, user]);

    const selectItem = (index: number) => {
      const item = orderedSuggestions[index];

      if (item) {
        command(item);
      }
    };

    const updateTriggerPosition = useCallback(() => {
      if (triggerRect && triggerRef.current) {
        setVirtualTriggerStyle({
          position: "fixed",
          left: triggerRect.left,
          // On iOS based browsers, the position is not correct without adding the offsetTop.
          // Something related to the position calculation when there is a scrollable area.
          top: triggerRect.top + (window.visualViewport?.offsetTop ?? 0),
          width: 1,
          height: triggerRect.height || 1,
          pointerEvents: "none",
          zIndex: -1,
        });
      }
    }, [triggerRect]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex(
            (selectedIndex + orderedSuggestions.length - 1) %
              orderedSuggestions.length
          );
          return true;
        }

        if (event.key === "ArrowDown") {
          if (orderedSuggestions.length === 0) {
            return false;
          }
          setSelectedIndex((selectedIndex + 1) % orderedSuggestions.length);
          return true;
        }

        if (event.key === "Enter" || event.key === "Tab") {
          selectItem(selectedIndex);
          return true;
        }

        return false;
      },
    }));

    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      updateTriggerPosition();
    }, [updateTriggerPosition]);

    // Reset the selected index when items change (e.g., when query changes).
    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIndex(0);
    }, [suggestions]);

    // Scroll selected item into view when selection changes.
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

    // Generate a key based on content state to force remount when content size changes significantly.
    // This ensures Radix UI recalculates collision detection and positioning.
    const contentKey = isLoading
      ? "loading"
      : orderedSuggestions.length === 0
        ? "empty"
        : `results-${suggestions.length}`;

    return (
      <DropdownMenu open={true}>
        <DropdownMenuTrigger asChild>
          <div ref={triggerRef} style={virtualTriggerStyle} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          key={contentKey}
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
          ) : orderedSuggestions.length > 0 ? (
            <div className="flex max-h-60 flex-col gap-y-1 overflow-y-auto p-1">
              {orderedSuggestions.map((suggestion, index) => (
                <div key={suggestion.id}>
                  <button
                    ref={index === selectedIndex ? selectedItemRef : null}
                    className={classNames(
                      "flex items-center px-2 py-1",
                      "w-full flex-initial cursor-pointer text-left text-sm",
                      index === selectedIndex
                        ? "text-highlight-500"
                        : "text-foreground dark:text-foreground-night"
                    )}
                    onClick={() => {
                      selectItem(index);
                    }}
                    onMouseEnter={() => {
                      setSelectedIndex(index);
                    }}
                  >
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
                        label="User"
                        className="ml-2 shrink-0"
                      />
                    )}
                  </button>
                </div>
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
