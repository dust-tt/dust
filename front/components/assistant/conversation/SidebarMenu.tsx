import { Button, ChatBubbleBottomCenterPlusIcon, Item } from "@dust-tt/sparkle";
import type {
  ConversationType,
  ConversationWithoutContentType,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { isOnlyUser } from "@dust-tt/types";
import moment from "moment";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useContext } from "react";

import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { SidebarContext } from "@app/components/sparkle/AppLayout";
import { classNames } from "@app/lib/utils";

type AssistantSidebarMenuProps = {
  owner: WorkspaceType;
  conversations: ConversationType[];
  isConversationsError: boolean;
};

export function AssistantSidebarMenu({
  owner,
  conversations,
  isConversationsError,
}: AssistantSidebarMenuProps) {
  const router = useRouter();
  const { setSidebarOpen } = useContext(SidebarContext);

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

  const conversationsByDate = conversations.length
    ? groupConversationsByDate(conversations)
    : {};

  const { setAnimate } = useContext(InputBarContext);

  const triggerInputAnimation = () => {
    setAnimate(true);
  };

  return (
    <div
      className={classNames(
        "flex grow flex-col",
        isOnlyUser(owner) ? "border-t border-structure-200" : ""
      )}
    >
      <div className="flex h-0 min-h-full w-full overflow-y-auto">
        <div className="flex w-full flex-col px-2">
          <div className={classNames("flex pt-2")}>
            <div className="flex-grow" />
            <Link
              href={`/w/${owner.sId}/assistant/new`}
              onClick={() => {
                setSidebarOpen(false);
                const { cId } = router.query;
                const isNewConversation =
                  router.pathname === "/w/[wId]/assistant/[cId]" &&
                  typeof cId === "string" &&
                  cId === "new";

                if (isNewConversation && triggerInputAnimation) {
                  triggerInputAnimation();
                }
              }}
            >
              <Button
                labelVisible={true}
                label="New conversation"
                icon={ChatBubbleBottomCenterPlusIcon}
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
                    <div className="px-2 py-1">
                      <Item.SectionHeader label={dateLabel} />
                    </div>
                    <Item.List>
                      {conversations.map(
                        (c: ConversationWithoutContentType) => {
                          return (
                            <Item.Entry
                              key={c.sId}
                              onClick={() => setSidebarOpen(false)}
                              selected={router.query.cId === c.sId}
                              label={
                                c.title ||
                                (moment(c.created).isSame(moment(), "day")
                                  ? "New Conversation"
                                  : `Conversation from ${new Date(
                                      c.created
                                    ).toLocaleDateString()}`)
                              }
                              className="px-2"
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
