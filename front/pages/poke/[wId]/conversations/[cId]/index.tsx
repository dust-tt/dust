import { Page } from "@dust-tt/sparkle";
import type {
  AgentMessageType,
  ContentFragmentType,
  ConversationType,
  UserMessageType,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { getConversation } from "@app/lib/api/assistant/conversation";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<{
  conversation: string;
}>(async (context, auth) => {
  const cId = context.params?.cId;
  if (!cId || typeof cId !== "string") {
    return {
      notFound: true,
    };
  }

  const conversation = await getConversation(auth, cId, true);
  if (!conversation) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      conversation: JSON.stringify(conversation),
    },
  };
});

const UserMessageView = ({ message }: { message: UserMessageType }) => {
  return (
    <div className="ml-4 pt-2 text-sm text-element-700">
      <div className="font-bold">@{message.user?.username}</div>
      <div className="text-element-600">version={message.version}</div>
      <div>{message.content}</div>
    </div>
  );
};

const AgentMessageView = ({ message }: { message: AgentMessageType }) => {
  return (
    <div className="ml-4 pt-2 text-sm text-element-700">
      <div className="font-bold">
        [{message.configuration.name}]{"{sId="}
        {message.configuration.sId}
        {"}"}
      </div>
      <div className="text-element-600">version={message.version}</div>
      <div>{message.content}</div>
    </div>
  );
};

const ContentFragmentView = ({ message }: { message: ContentFragmentType }) => {
  return (
    <div className="ml-4 pt-2 text-sm text-element-700">
      <div className="font-bold">Content Fragment</div>
      <div className="text-element-600">version={message.version}</div>
      <div className="text-element-600">title={message.title}</div>
      <div className="text-element-600">sourceUrl={message.sourceUrl}</div>
      <div className="text-element-600">textBytes={message.textBytes}</div>
    </div>
  );
};

const ConversationPage = ({
  conversation,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const c = JSON.parse(conversation) as ConversationType;
  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="mx-auto max-w-4xl pt-8">
        <Page.Vertical align="stretch">
          {c.content.map((messages, i) => {
            return (
              <div key={`messages-${i}`}>
                {messages.map((m, j) => {
                  switch (m.type) {
                    case "agent_message": {
                      return (
                        <AgentMessageView
                          message={m}
                          key={`message-${i}-${j}`}
                        />
                      );
                    }
                    case "user_message": {
                      return (
                        <UserMessageView
                          message={m}
                          key={`message-${i}-${j}`}
                        />
                      );
                    }
                    case "content_fragment": {
                      return (
                        <ContentFragmentView
                          message={m}
                          key={`message-${i}-${j}`}
                        />
                      );
                    }
                    default:
                      assertNever(m);
                  }
                })}
              </div>
            );
          })}
        </Page.Vertical>
      </div>
    </div>
  );
};

export default ConversationPage;
