import { Button, ChatBubbleBottomCenterTextIcon, Item } from "@dust-tt/sparkle";
import moment from "moment";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

import { useConversations } from "@app/lib/swr";
import { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { WorkspaceType } from "@app/types/user";

export function AssistantSidebarMenu({
  owner,
  triggerInputAnimation,
}: {
  owner: WorkspaceType;
  triggerInputAnimation: (() => void) | null;
}) {
  const router = useRouter();

  const { conversations, isConversationsLoading, isConversationsError } =
    useConversations({
      workspaceId: owner.sId,
    });

  const groupConversationsByDate = (
    conversations: ConversationWithoutContentType[]
  ) => {
    const today = moment().startOf("day");
    const yesterday = moment().subtract(1, "days").startOf("day");
    const lastWeek = moment().subtract(1, "weeks").startOf("day");
    const lastMonth = moment().subtract(1, "months").startOf("day");
    const lastYear = moment().subtract(1, "years").startOf("day");

    const groups: { [key: string]: ConversationWithoutContentType[] } = {
      Today: [],
      Yesterday: [],
      "Last Week": [],
      "Last Month": [],
      "Last Year": [],
      Older: [],
    };

    conversations.forEach((conversation: ConversationWithoutContentType) => {
      const createdDate = moment(conversation.created);
      if (createdDate.isSameOrAfter(today)) {
        groups["Today"].push(conversation);
      } else if (createdDate.isSameOrAfter(yesterday)) {
        groups["Yesterday"].push(conversation);
      } else if (createdDate.isSameOrAfter(lastWeek)) {
        groups["Last Week"].push(conversation);
      } else if (createdDate.isSameOrAfter(lastMonth)) {
        groups["Last Month"].push(conversation);
      } else if (createdDate.isSameOrAfter(lastYear)) {
        groups["Last Year"].push(conversation);
      } else {
        groups["Older"].push(conversation);
      }
    });

    return groups;
  };

  const conversationsByDate =
    !isConversationsLoading && conversations.length
      ? groupConversationsByDate(conversations)
      : {};

  return (
    <div className="flex grow flex-col">
      <div className="flex h-0 min-h-full w-full overflow-y-auto">
        <div className="flex w-full flex-col pl-4 pr-2">
          <div className="pr py-4 text-right">
            <Link
              href={`/w/${owner.sId}/assistant/new`}
              onClick={() => {
                if (
                  router.pathname === "/w/[wId]/assistant/new" &&
                  triggerInputAnimation
                ) {
                  triggerInputAnimation();
                }
              }}
            >
              <Button
                labelVisible={true}
                label="New Conversation"
                icon={ChatBubbleBottomCenterTextIcon}
                className="flex-none shrink"
              />
            </Link>
          </div>
          {isConversationsError && (
            <div className="py-1">
              <Item.SectionHeader label="Error loading conversations" />
            </div>
          )}
          {conversationsByDate &&
            Object.keys(conversationsByDate).map((dateLabel) => {
              const conversations = conversationsByDate[dateLabel];
              return (
                conversations.length > 0 && (
                  <React.Fragment key={dateLabel}>
                    <div className="py-1">
                      <Item.SectionHeader label={dateLabel} />
                    </div>
                    <Item.List>
                      {conversations.map(
                        (c: ConversationWithoutContentType) => {
                          return (
                            <Item
                              key={c.sId}
                              size="sm"
                              selected={router.query.cId === c.sId}
                              label={
                                c.title ||
                                (moment(c.created).isSame(moment(), "day")
                                  ? "New Conversation"
                                  : `Conversation from ${new Date(
                                      c.created
                                    ).toLocaleDateString()}`)
                              }
                              href={`/w/${owner.sId}/assistant/${c.sId}`}
                            />
                          );
                        }
                      )}
                    </Item.List>
                  </React.Fragment>
                )
              );
            })}
        </div>
      </div>
    </div>
  );
}
