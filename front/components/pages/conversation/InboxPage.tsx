import {
  Button,
  CheckIcon,
  ConversationListItem,
  InboxIcon,
  ListGroup,
  ListItemSection,
  Spinner,
} from "@dust-tt/sparkle";
import moment from "moment";
import { useEffect, useMemo } from "react";

import { SpaceConversationListItem } from "@app/components/assistant/conversation/space/conversations/SpaceConversationListItem";
import { useMarkAllConversationsAsRead } from "@app/hooks/useMarkAllConversationsAsRead";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import {
  useConversations,
  useSpaceConversations,
  useSpaceConversationsSummary,
} from "@app/lib/swr/conversations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { getConversationRoute } from "@app/lib/utils/router";
import { formatTimestring } from "@app/lib/utils/timestamps";
import type {
  ConversationWithoutContentType,
  LightConversationType,
  SpaceType,
  WorkspaceType,
} from "@app/types";

function getConversationTitle(
  conversation: ConversationWithoutContentType
): string {
  return (
    conversation.title ??
    (moment(conversation.created).isSame(moment(), "day")
      ? "New Conversation"
      : `Conversation from ${new Date(conversation.created).toLocaleDateString()}`)
  );
}

interface InboxSectionProps {
  label: string;
  conversations: ConversationWithoutContentType[];
  owner: WorkspaceType;
  children: React.ReactNode;
}

function InboxSection({
  label,
  conversations,
  owner,
  children,
}: InboxSectionProps) {
  const { markAllAsRead, isMarkingAllAsRead } = useMarkAllConversationsAsRead({
    owner,
  });

  if (conversations.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col">
      <ListItemSection
        size="sm"
        action={
          <Button
            size="xs"
            variant="ghost-secondary"
            icon={CheckIcon}
            label="Mark as read"
            onClick={() => markAllAsRead(conversations)}
            isLoading={isMarkingAllAsRead}
          />
        }
      >
        {label}
      </ListItemSection>
      <ListGroup>{children}</ListGroup>
    </div>
  );
}

/**
 * Renders a ConversationListItem from lean conversation data
 * (ConversationWithoutContentType), used when rich data is unavailable.
 */
interface LeanConversationItemProps {
  conversation: ConversationWithoutContentType;
  owner: WorkspaceType;
}

function LeanConversationItem({
  conversation,
  owner,
}: LeanConversationItemProps) {
  const router = useAppRouter();

  return (
    <ConversationListItem
      conversation={{
        id: conversation.sId,
        title: getConversationTitle(conversation),
        updatedAt: new Date(conversation.updated),
      }}
      time={formatTimestring(conversation.updated)}
      onClick={async () => {
        await router.push(
          getConversationRoute(owner.sId, conversation.sId),
          undefined,
          { shallow: true }
        );
      }}
    />
  );
}

interface PersonalInboxSectionProps {
  conversations: ConversationWithoutContentType[];
  owner: WorkspaceType;
}

function PersonalInboxSection({
  conversations,
  owner,
}: PersonalInboxSectionProps) {
  return (
    <InboxSection
      label={`My conversations (${conversations.length})`}
      conversations={conversations}
      owner={owner}
    >
      {conversations.map((conversation) => (
        <LeanConversationItem
          key={conversation.sId}
          conversation={conversation}
          owner={owner}
        />
      ))}
    </InboxSection>
  );
}

interface SpaceInboxSectionProps {
  space: SpaceType;
  unreadConversations: ConversationWithoutContentType[];
  owner: WorkspaceType;
}

function SpaceInboxSection({
  space,
  unreadConversations,
  owner,
}: SpaceInboxSectionProps) {
  // Fetch rich conversation data for this space.
  const { conversations: spaceConversations } = useSpaceConversations({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });

  // Map from sId to LightConversationType for rich rendering.
  const richConversationMap = useMemo(() => {
    const map = new Map<string, LightConversationType>();
    for (const c of spaceConversations) {
      map.set(c.sId, c);
    }
    return map;
  }, [spaceConversations]);

  const sortedUnread = useMemo(
    () => [...unreadConversations].sort((a, b) => b.updated - a.updated),
    [unreadConversations]
  );

  return (
    <InboxSection
      label={`${space.name} (${sortedUnread.length})`}
      conversations={sortedUnread}
      owner={owner}
    >
      {sortedUnread.map((conversation) => {
        const richConversation = richConversationMap.get(conversation.sId);
        if (richConversation) {
          return (
            <SpaceConversationListItem
              key={conversation.sId}
              conversation={richConversation}
              owner={owner}
            />
          );
        }
        return (
          <LeanConversationItem
            key={conversation.sId}
            conversation={conversation}
            owner={owner}
          />
        );
      })}
    </InboxSection>
  );
}

export function InboxPage() {
  const owner = useWorkspace();
  const router = useAppRouter();
  const { hasFeature, isFeatureFlagsLoading } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const hasSpaceConversations = hasFeature("projects");

  useEffect(() => {
    if (!isFeatureFlagsLoading && !hasSpaceConversations) {
      void router.replace(getConversationRoute(owner.sId, "new"));
    }
  }, [isFeatureFlagsLoading, hasSpaceConversations, router, owner.sId]);

  const { conversations, isConversationsLoading } = useConversations({
    workspaceId: owner.sId,
  });

  const { summary, isLoading: isSummaryLoading } = useSpaceConversationsSummary(
    {
      workspaceId: owner.sId,
      options: { disabled: !hasSpaceConversations },
    }
  );

  // Personal unread conversations (not in a space).
  const personalUnreadConversations = useMemo(
    () =>
      conversations
        .filter((c) => (c.unread || c.actionRequired) && !c.spaceId)
        .toSorted((a, b) => b.updated - a.updated),
    [conversations]
  );

  // Space sections with unread conversations.
  const spaceSections = useMemo(
    () => summary.filter((s) => s.unreadConversations.length > 0),
    [summary]
  );

  // Redirect when projects flag is off.
  if (!isFeatureFlagsLoading && !hasSpaceConversations) {
    return (
      <div className="flex h-full w-full items-center justify-center px-6">
        <Spinner />
      </div>
    );
  }

  const isLoading = isConversationsLoading || isSummaryLoading;
  const hasNoUnread =
    personalUnreadConversations.length === 0 && spaceSections.length === 0;

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center px-6">
        <Spinner />
      </div>
    );
  }

  if (hasNoUnread) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-foreground dark:text-foreground-night">
        <InboxIcon className="h-8 w-8" />
        <h2 className="text-2xl">Inbox</h2>
        <p className="text-center text-lg text-muted-foreground dark:text-muted-foreground-night">
          You&apos;re all caught up!
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col px-6">
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col py-8">
          <h2 className="mb-4 text-2xl font-bold text-foreground dark:text-foreground-night">
            Inbox
          </h2>
          <div className="flex flex-col">
            <PersonalInboxSection
              conversations={personalUnreadConversations}
              owner={owner}
            />

            {spaceSections.map(({ space, unreadConversations }) => (
              <SpaceInboxSection
                key={space.sId}
                space={space}
                unreadConversations={unreadConversations}
                owner={owner}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
