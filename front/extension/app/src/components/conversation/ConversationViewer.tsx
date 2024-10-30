import type { MessageWithContentFragmentsType } from "@app/components/assistant/conversation/ConversationViewer";
import type {
  AgentMessageType,
  ContentFragmentType,
  LightWorkspaceType,
  UserMessageType,
} from "@dust-tt/types";
import { isContentFragmentType, isUserMessageType } from "@dust-tt/types";
import MessageGroup from "@extension/components/conversation/MessageGroup";
import { usePublicConversation } from "@extension/components/conversation/usePublicConversation";
import type { StoredUser } from "@extension/lib/storage";
import { classNames } from "@extension/lib/utils";
import { useMemo } from "react";

interface ConversationViewerProps {
  conversationId: string;
  owner: LightWorkspaceType;
  user: StoredUser;
}

export function ConversationViewer({
  conversationId,
  owner,
  user,
}: ConversationViewerProps) {
  const { conversation } = usePublicConversation({
    conversationId,
    workspaceId: owner.sId,
  });

  const messages = conversation?.content;

  const typedGroupedMessages = useMemo(
    () => (messages ? groupMessagesByType(messages) : []),
    [messages]
  );

  return (
    <div
      className={classNames(
        "flex w-full max-w-4xl flex-1 flex-col justify-start gap-2 pb-4"
      )}
    >
      {/* Invisible span to detect when the user has scrolled to the top of the list. */}
      {conversation &&
        typedGroupedMessages.map((typedGroup, index) => {
          const isLastGroup = index === typedGroupedMessages.length - 1;
          return (
            <MessageGroup
              key={`typed-group-${index}`}
              messages={typedGroup}
              isLastMessageGroup={isLastGroup}
              conversationId={conversationId}
              hideReactions={true}
              isInModal={false}
              owner={owner}
              reactions={[]}
              user={user}
            />
          );
        })}
    </div>
  );
}
/**
 * Groups and organizes messages by their type, associating content_fragments
 * with the following user_message.
 *
 * This function processes an array of messages, collecting content_fragments
 * and attaching them to subsequent user_messages, then groups these messages
 * with the previous user_message, ensuring consecutive messages are grouped
 * together.
 *
 * Example:
 * Input [[content_fragment, content_fragment], [user_message], [agent_message, agent_message]]
 * Output: [[user_message with content_fragment[]], [agent_message, agent_message]]
 * This structure enables layout customization for consecutive messages of the same type
 * and displays content_fragments within user_messages.
 */
const groupMessagesByType = (
  messages: (ContentFragmentType[] | UserMessageType[] | AgentMessageType[])[]
): MessageWithContentFragmentsType[][][] => {
  const groupedMessages: MessageWithContentFragmentsType[][][] = [];
  let tempContentFragments: ContentFragmentType[] = [];

  messages.forEach((page) =>
    page.forEach((message) => {
      if (isContentFragmentType(message)) {
        tempContentFragments.push(message); // Collect content fragments.
      } else {
        let messageWithContentFragments: MessageWithContentFragmentsType;
        if (isUserMessageType(message)) {
          // Attach collected content fragments to the user message.
          messageWithContentFragments = {
            ...message,
            contenFragments: tempContentFragments,
          };
          tempContentFragments = []; // Reset the collected content fragments.

          // Start a new group for user messages.
          groupedMessages.push([[messageWithContentFragments]]);
        } else {
          messageWithContentFragments = message;

          const lastGroup = groupedMessages[groupedMessages.length - 1];

          if (!lastGroup) {
            groupedMessages.push([[messageWithContentFragments]]);
          } else {
            const [lastMessageGroup] = lastGroup;
            lastMessageGroup.push(messageWithContentFragments); // Add agent messages to the last group.
          }
        }
      }
    })
  );
  return groupedMessages;
};
