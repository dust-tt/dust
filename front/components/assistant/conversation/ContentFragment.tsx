import { ExternalLinkIcon, SlackLogo } from "@dust-tt/sparkle";

import { ContentFragmentType } from "@app/types/assistant/conversation";
import { UserType, WorkspaceType } from "@app/types/user";

import { ConversationMessage } from "./ConversationMessage";

export function ContentFragment({
  owner,
  user,
  conversationId,
  message,
}: {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string;
  message: ContentFragmentType;
}) {
  return (
    <ConversationMessage
      owner={owner}
      user={user}
      conversationId={conversationId}
      messageId={message.sId}
      pictureUrl={
        <>
          <SlackLogo />
        </>
      }
      name={message.title}
      reactions={[]}
      enableEmojis={false}
      buttons={
        message.url
          ? [
              {
                label: "Open",
                icon: ExternalLinkIcon,
                onClick: () => {
                  if (message.url) {
                    window.location.href = message.url;
                  }
                },
              },
            ]
          : []
      }
    >
      {message.title}
    </ConversationMessage>
  );
}
