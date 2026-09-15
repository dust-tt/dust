import {
  Button,
  Clock,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  ListGroup,
  ListItemSection,
  ReplySection,
  SearchInput,
  XClose,
} from "@dust-tt/sparkle";
import { Fragment, useMemo, useState } from "react";

import { getAgentById } from "../data/agents";
import {
  FIRE_BUCKETS,
  type FireBucket,
  formatWakeUpFireLabel,
  getFireBucket,
} from "../data/time";
import type { Conversation, WakeUp } from "../data/types";
import { getUserById } from "../data/users";
import { getWakeUpDescription } from "../data/wakeups";
import { EmptyState } from "./EmptyState";
import { ConversationListItem } from "./ConversationListItem";

interface WakeUpsManageViewProps {
  wakeUps: WakeUp[];
  /** The conversations the wake-ups were set in — the rows of this list. */
  conversations: Conversation[];
  /** Only the wake-ups this member owns are theirs to dismiss. */
  currentUserId?: string;
  onDismissWakeUp?: (wakeUpId: string) => void;
  onConversationClick?: (conversation: Conversation) => void;
}

/**
 * The same deterministic stand-in the other conversation lists use, so a row's
 * reply count does not jump around when the list re-renders.
 */
function seededRandom(seed: string, index: number): number {
  const hash = seed
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const x = Math.sin((hash + index) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** The people and agents in the conversation, for the row's avatar stack. */
function getParticipantAvatars(conversation: Conversation) {
  return [
    ...conversation.userParticipants.flatMap((userId) => {
      const user = getUserById(userId);
      return user
        ? [{ name: user.fullName, visual: user.portrait, isRounded: true }]
        : [];
    }),
    ...conversation.agentParticipants.flatMap((agentId) => {
      const agent = getAgentById(agentId);
      return agent
        ? [
            {
              name: agent.name,
              emoji: agent.emoji,
              backgroundColor: agent.backgroundColor,
              isRounded: false,
            },
          ]
        : [];
    }),
  ];
}

function WakeUpRow({
  wakeUp,
  conversation,
  onDismiss,
  onClick,
}: {
  wakeUp: WakeUp;
  conversation: Conversation;
  onDismiss: () => void;
  onClick?: () => void;
}) {
  const [creatorId] = conversation.userParticipants;
  const creator = creatorId ? getUserById(creatorId) : undefined;
  // A conversation with nobody but an agent in it is a direct one, and reads by
  // the agent instead of by whoever started it.
  const agent = getAgentById(conversation.agentParticipants[0] ?? "");
  const avatars = getParticipantAvatars(conversation);
  const replyCount =
    Math.floor(seededRandom(`${conversation.id}-wake-up-row`, 0) * 8) + 1;

  return (
    <ConversationListItem
      unread={false}
      conversation={{
        id: conversation.id,
        title: conversation.title,
        description: getWakeUpDescription(wakeUp),
        updatedAt: conversation.updatedAt,
      }}
      className="rounded-2xl border-t-0 border-b-0 hover:bg-hover"
      {...(creator
        ? {
            creator: { fullName: creator.fullName, portrait: creator.portrait },
          }
        : agent
          ? {
              avatar: {
                name: agent.name,
                emoji: agent.emoji,
                backgroundColor: agent.backgroundColor,
              },
            }
          : {})}
      replySection={
        <ReplySection
          replyCount={replyCount}
          unreadCount={0}
          avatars={avatars}
          lastMessageBy={avatars[0]?.name ?? "Unknown"}
        />
      }
      trailing={
        <>
          <span className="flex items-center gap-1">
            <Icon visual={Clock} size="xs" />
            {formatWakeUpFireLabel(wakeUp.schedule.nextFireAt)}
          </span>
          {/* Dismissing is not a way into the conversation: the row's own click
              would otherwise open it behind the wake-up being called off. */}
          <span onClick={(event) => event.stopPropagation()}>
            <Button
              variant="ghost"
              size="xs"
              icon={XClose}
              tooltip="Dismiss wake-up"
              onClick={onDismiss}
            />
          </span>
        </>
      }
      onClick={onClick}
    />
  );
}

/**
 * The conversations waiting on a wake-up. These are ordinary conversations that
 * had a schedule added to them at some point — not runs an agent started on its
 * own, which belong to the triggered conversations — so a row reads like any
 * other conversation row, and the wake-up only adds why the agent is coming
 * back and when. The list is ordered by what happens next, and dismissing is
 * all there is to do with a wake-up — it cannot be paused and resumed — so it
 * asks first.
 */
export function WakeUpsManageView({
  wakeUps,
  conversations,
  currentUserId,
  onDismissWakeUp,
  onConversationClick,
}: WakeUpsManageViewProps) {
  const [pendingWakeUp, setPendingWakeUp] = useState<WakeUp | null>(null);
  // The reason outlives the dialog it was asked about, so the question does not
  // blank out on its way off screen.
  const [pendingReason, setPendingReason] = useState("");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const conversationsById = new Map(
      conversations.map((conversation) => [conversation.id, conversation])
    );

    return wakeUps
      .filter((wakeUp) => !currentUserId || wakeUp.userId === currentUserId)
      .flatMap((wakeUp) => {
        const conversation = conversationsById.get(wakeUp.conversationId);
        return conversation ? [{ wakeUp, conversation }] : [];
      })
      .sort(
        (a, b) =>
          a.wakeUp.schedule.nextFireAt.getTime() -
          b.wakeUp.schedule.nextFireAt.getTime()
      );
  }, [conversations, currentUserId, wakeUps]);

  // A conversation is looked for by its title, or by what the agent said it was
  // coming back to do.
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }
    return rows.filter(
      ({ wakeUp, conversation }) =>
        conversation.title.toLowerCase().includes(query) ||
        getWakeUpDescription(wakeUp).toLowerCase().includes(query)
    );
  }, [rows, search]);

  // Rows arrive soonest first, so each section keeps that order.
  const rowsByBucket = useMemo(() => {
    const buckets = new Map<FireBucket, typeof visibleRows>();
    for (const row of visibleRows) {
      const bucket = getFireBucket(row.wakeUp.schedule.nextFireAt);
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), row]);
    }
    return buckets;
  }, [visibleRows]);

  return (
    <div className="flex h-full w-full flex-col overflow-x-clip overflow-y-auto bg-background px-4">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 pt-6 pb-8">
        {rows.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No wake-ups"
            description="No conversation has a wake-up scheduled."
          />
        ) : (
          <>
            <SearchInput
              name="wakeups-search"
              placeholder="Search wake-ups"
              value={search}
              onChange={setSearch}
              className="w-full min-w-0 max-w-80"
            />

            {visibleRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No wake-up matches your search.
              </div>
            ) : (
              <div className="flex flex-col">
                {FIRE_BUCKETS.map((bucket) => {
                  const bucketRows = rowsByBucket.get(bucket);
                  if (!bucketRows?.length) {
                    return null;
                  }

                  return (
                    <Fragment key={bucket}>
                      <ListItemSection className="pl-4">
                        {bucket}
                      </ListItemSection>
                      <ListGroup className="border-transparent! gap-0.5">
                        {bucketRows.map(({ wakeUp, conversation }) => (
                          <WakeUpRow
                            key={wakeUp.id}
                            wakeUp={wakeUp}
                            conversation={conversation}
                            onDismiss={() => {
                              setPendingWakeUp(wakeUp);
                              setPendingReason(wakeUp.reason);
                            }}
                            onClick={
                              onConversationClick
                                ? () => onConversationClick(conversation)
                                : undefined
                            }
                          />
                        ))}
                      </ListGroup>
                    </Fragment>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <Dialog
        open={pendingWakeUp !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingWakeUp(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Dismiss this wake-up?</DialogTitle>
            <DialogDescription>
              {`Are you sure? "${pendingReason}" will not come back.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            leftButtonProps={{
              label: "No",
              variant: "outline",
              onClick: () => setPendingWakeUp(null),
            }}
            rightButtonProps={{
              label: "Yes",
              variant: "warning",
              onClick: () => {
                if (pendingWakeUp) {
                  onDismissWakeUp?.(pendingWakeUp.id);
                }
                setPendingWakeUp(null);
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
