import {
  BarHeader,
  ExternalLinkIcon,
  IconButton,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
} from "@dust-tt/sparkle";
import type { ConversationWithoutContentType } from "@dust-tt/types";
import type { ProtectedRouteChildrenProps } from "@extension/components/auth/ProtectedRoute";
import { useConversations } from "@extension/components/conversation/useConversations";
import moment from "moment";
import { useNavigate } from "react-router-dom";

type GroupLabel =
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Last 12 Months"
  | "Older";

export const ConversationsPage = ({
  workspace,
}: ProtectedRouteChildrenProps) => {
  const navigate = useNavigate();
  const conversations = useConversations({ workspaceId: workspace.sId });

  const groupConversationsByDate = (
    conversations: ConversationWithoutContentType[]
  ) => {
    const today = moment().startOf("day");
    const yesterday = moment().subtract(1, "days").startOf("day");
    const lastWeek = moment().subtract(1, "weeks").startOf("day");
    const lastMonth = moment().subtract(1, "months").startOf("day");
    const lastYear = moment().subtract(1, "years").startOf("day");

    const groups: Record<GroupLabel, ConversationWithoutContentType[]> = {
      Today: [],
      Yesterday: [],
      "Last Week": [],
      "Last Month": [],
      "Last 12 Months": [],
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
        groups["Last 12 Months"].push(conversation);
      } else {
        groups["Older"].push(conversation);
      }
    });

    return groups;
  };

  const conversationsByDate = conversations.conversations.length
    ? groupConversationsByDate(conversations.conversations)
    : ({} as Record<GroupLabel, ConversationWithoutContentType[]>);

  return (
    <>
      <BarHeader
        title="Conversations"
        rightActions={
          <div>
            <a
              href={`${process.env.DUST_DOMAIN}/w/${workspace.sId}`}
              target="_blank"
            >
              <IconButton icon={ExternalLinkIcon} />
            </a>
            <BarHeader.ButtonBar
              variant="close"
              onClose={() => navigate("/")}
            />
          </div>
        }
      />
      <div className="h-full w-full pt-4">
        {conversationsByDate &&
          Object.keys(conversationsByDate).map((dateLabel) => (
            <RenderConversations
              key={dateLabel}
              conversations={conversationsByDate[dateLabel as GroupLabel]}
              dateLabel={dateLabel}
              navigate={navigate}
            />
          ))}
      </div>
    </>
  );
};

const RenderConversations = ({
  conversations,
  dateLabel,
  navigate,
}: {
  conversations: ConversationWithoutContentType[];
  dateLabel: string;
  navigate: (path: string) => void;
}) => {
  if (!conversations.length) {
    return null;
  }

  const getLabel = (conversation: ConversationWithoutContentType): string => {
    const conversationLabel =
      conversation.title ||
      (moment(conversation.created).isSame(moment(), "day")
        ? "New Conversation"
        : `Conversation from ${new Date(conversation.created).toLocaleDateString()}`);

    return conversationLabel;
  };

  return (
    <div>
      <NavigationListLabel label={dateLabel} />
      <NavigationList>
        {conversations.map((conversation) => (
          <NavigationListItem
            key={conversation.sId}
            label={getLabel(conversation)}
            onClick={() => navigate(`/conversations/${conversation.sId}`)}
          />
        ))}
      </NavigationList>
    </div>
  );
};
