import {
  Button,
  ChatBubbleBottomCenterPlusIcon,
  Checkbox,
  IconButton,
  Item,
  ListCheckIcon,
  MoreIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { ConversationType } from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { isOnlyUser } from "@dust-tt/types";
import moment from "moment";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useCallback, useContext, useState } from "react";

import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import {
  useConversations,
  useDeleteConversation,
} from "@app/lib/swr/conversations";
import { classNames } from "@app/lib/utils";

type AssistantSidebarMenuProps = {
  owner: WorkspaceType;
};

export function AssistantSidebarMenu({ owner }: AssistantSidebarMenuProps) {
  const router = useRouter();
  const { setSidebarOpen } = useContext(SidebarContext);
  const { conversations, isConversationsError } = useConversations({
    workspaceId: owner.sId,
  });
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedConversations, setSelectedConversations] = useState<
    ConversationType[]
  >([]);
  const doDelete = useDeleteConversation(owner);

  const toggleMutliSelect = useCallback(() => {
    setIsMultiSelect((prev) => !prev);
    setSelectedConversations([]);
  }, [setIsMultiSelect, setSelectedConversations]);

  const batchDelete = useCallback(async () => {
    if (selectedConversations.length === 0) {
      return;
    } else {
      for (const conversation of selectedConversations) {
        await doDelete(conversation);
      }
      toggleMutliSelect();
    }
  }, [doDelete, selectedConversations, toggleMutliSelect]);

  const groupConversationsByDate = (conversations: ConversationType[]) => {
    const today = moment().startOf("day");
    const yesterday = moment().subtract(1, "days").startOf("day");
    const lastWeek = moment().subtract(1, "weeks").startOf("day");
    const lastMonth = moment().subtract(1, "months").startOf("day");
    const lastYear = moment().subtract(1, "years").startOf("day");

    const groups: { [key: string]: ConversationType[] } = {
      Today: [],
      Yesterday: [],
      "Last Week": [],
      "Last Month": [],
      "Last Year": [],
      Older: [],
    };

    conversations.forEach((conversation: ConversationType) => {
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
          {isMultiSelect ? (
            <div className={classNames("flex pt-2")}>
              <IconButton
                icon={ListCheckIcon}
                onClick={toggleMutliSelect}
                className="mr-2"
              />
              {selectedConversations.length > 0 && (
                <IconButton
                  icon={TrashIcon}
                  disabled={selectedConversations.length === 0}
                  onClick={batchDelete}
                />
              )}
              <div className="flex-grow" />
            </div>
          ) : (
            <div className={classNames("flex pt-2")}>
              <div className="flex-grow" />
              <Button
                label=""
                icon={MoreIcon}
                variant="tertiary"
                size="sm"
                labelVisible={false}
                hasMagnifying={false}
                disabledTooltip={true}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMutliSelect();
                }}
              />
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
          )}
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
                      {conversations.map((c: ConversationType) => {
                        return (
                          <Item
                            spacing="sm"
                            style="item"
                            action={
                              isMultiSelect
                                ? () => (
                                    <Checkbox
                                      variant="checkable"
                                      checked={
                                        selectedConversations.includes(c)
                                          ? "checked"
                                          : "unchecked"
                                      }
                                      onChange={() => {
                                        if (selectedConversations.includes(c)) {
                                          setSelectedConversations((prev) =>
                                            prev.filter((id) => id !== c)
                                          );
                                        } else {
                                          setSelectedConversations((prev) => [
                                            ...prev,
                                            c,
                                          ]);
                                        }
                                      }}
                                    />
                                  )
                                : undefined
                            }
                            hasAction={"hover"}
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
                            link={
                              isMultiSelect
                                ? undefined
                                : {
                                    href: `/w/${owner.sId}/assistant/${c.sId}`,
                                  }
                            }
                          />
                        );
                      })}
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
