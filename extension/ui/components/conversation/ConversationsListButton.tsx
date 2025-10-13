import { removeDiacritics, subFilter } from "@app/shared/lib/utils";
import { useConversations } from "@app/ui/components/conversation/useConversations";
import type { ConversationWithoutContentPublicType } from "@dust-tt/client";
import {
  Button,
  ChatBubbleLeftRightIcon,
  classNames,
  DotIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Icon,
  ScrollArea,
  Spinner,
} from "@dust-tt/sparkle";
import moment from "moment";
import React, { useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import { useNavigate, useParams } from "react-router-dom";

type GroupLabel =
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Last 12 Months"
  | "Older";

interface ConversationListMenuItemProps {
  conversation: ConversationWithoutContentPublicType;
  selectedConversationId: string;
  navigate: NavigateFunction;
}

function ConversationListMenuItem({
  conversation,
  selectedConversationId,
  navigate,
}: ConversationListMenuItemProps) {
  const UnreadIcon = () => (
    <Icon visual={DotIcon} className="-ml-1 -mr-2 text-highlight" />
  );

  const conversationLabel = conversation.title || "Untitled Conversation";
  return (
    <DropdownMenuItem
      key={conversation.sId}
      label={conversationLabel}
      icon={conversation.unread ? UnreadIcon : undefined}
      truncateText={true}
      className={classNames(
        "text-sm text-muted-foreground dark:text-muted-foreground-night font-normal",
        selectedConversationId === conversation.sId
          ? "bg-primary-50 dark:bg-primary-50-night"
          : ""
      )}
      onClick={() => {
        navigate(`/conversations/${conversation.sId}`);
      }}
    />
  );
}

const Content = () => {
  const { conversations, isConversationsLoading } = useConversations();
  const { conversationId } = useParams();
  const [titleFilter, setTitleFilter] = useState("");

  const navigate = useNavigate();

  const groupConversationsByDate = (
    conversations: ConversationWithoutContentPublicType[]
  ) => {
    const today = moment().startOf("day");
    const yesterday = moment().subtract(1, "days").startOf("day");
    const lastWeek = moment().subtract(1, "weeks").startOf("day");
    const lastMonth = moment().subtract(1, "months").startOf("day");
    const lastYear = moment().subtract(1, "years").startOf("day");

    type GroupLabel =
      | "Today"
      | "Yesterday"
      | "Last Week"
      | "Last Month"
      | "Last 12 Months"
      | "Older";

    const groups: Record<GroupLabel, ConversationWithoutContentPublicType[]> = {
      Today: [],
      Yesterday: [],
      "Last Week": [],
      "Last Month": [],
      "Last 12 Months": [],
      Older: [],
    };

    conversations.forEach((conversation) => {
      if (
        titleFilter &&
        !subFilter(
          removeDiacritics(titleFilter).toLowerCase(),
          removeDiacritics(conversation.title ?? "").toLowerCase()
        )
      ) {
        return;
      }

      const updatedAt = moment(conversation.updated ?? conversation.created);
      if (updatedAt.isSameOrAfter(today)) {
        groups["Today"].push(conversation);
      } else if (updatedAt.isSameOrAfter(yesterday)) {
        groups["Yesterday"].push(conversation);
      } else if (updatedAt.isSameOrAfter(lastWeek)) {
        groups["Last Week"].push(conversation);
      } else if (updatedAt.isSameOrAfter(lastMonth)) {
        groups["Last Month"].push(conversation);
      } else if (updatedAt.isSameOrAfter(lastYear)) {
        groups["Last 12 Months"].push(conversation);
      } else {
        groups["Older"].push(conversation);
      }
    });

    return groups;
  };

  const conversationsByDate = conversations.length
    ? groupConversationsByDate(conversations)
    : ({} as Record<GroupLabel, ConversationWithoutContentPublicType[]>);

  return (
    <>
      <DropdownMenuSearchbar
        onChange={setTitleFilter}
        value={titleFilter}
        name="search"
      />

      {isConversationsLoading ? (
        <div className="flex items-center justify-center m-4">
          <Spinner size="xs" />
        </div>
      ) : (
        <ScrollArea className="h-[80vh]">
          {Object.keys(conversationsByDate).map((dateLabel) => (
            <React.Fragment key={dateLabel}>
              {conversationsByDate[dateLabel as GroupLabel].length > 0 && (
                <DropdownMenuLabel
                  label={dateLabel}
                  className={classNames(
                    "text-foreground dark:text-foreground-night"
                  )}
                />
              )}
              {conversationsByDate[dateLabel as GroupLabel].map(
                (conversation) => (
                  <ConversationListMenuItem
                    key={conversation.sId}
                    conversation={conversation}
                    selectedConversationId={conversationId!}
                    navigate={navigate}
                  />
                )
              )}
            </React.Fragment>
          ))}
        </ScrollArea>
      )}
    </>
  );
};

export const ConversationsListButton = ({
  size = "sm",
}: {
  size?: "sm" | "md";
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          tooltip="View conversations"
          icon={ChatBubbleLeftRightIcon}
          isSelect
          variant="ghost"
          size={size}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[80vw]">
        <div className="py-2">
          <Content />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
