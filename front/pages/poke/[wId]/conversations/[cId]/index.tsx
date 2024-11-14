import { Button, Page } from "@dust-tt/sparkle";
import type {
  AgentMessageType,
  ContentFragmentType,
  UserMessageType,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { DustProdActionRegistry } from "@app/lib/registry";
import { useConversation } from "@app/poke/swr";

export const getServerSideProps = withSuperUserAuthRequirements<{
  workspaceId: string;
  conversationId: string;
}>(async (context) => {
  const cId = context.params?.cId;
  if (!cId || typeof cId !== "string") {
    return {
      notFound: true,
    };
  }

  const wId = context.params?.wId;
  if (!wId || typeof wId !== "string") {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      workspaceId: wId,
      conversationId: cId,
    },
  };
});

const UserMessageView = ({ message }: { message: UserMessageType }) => {
  return (
    <div className="ml-4 pt-2 text-sm text-element-700">
      {message.user && (
        <div className="font-bold">
          [user] @{message.user.username} (fullName={message.user.fullName}{" "}
          email=
          {message.user.email})
        </div>
      )}
      <div className="text-element-600">version={message.version}</div>
      <div>{message.content}</div>
    </div>
  );
};

const AgentMessageView = ({ message }: { message: AgentMessageType }) => {
  return (
    <div className="ml-4 pt-2 text-sm text-element-700">
      <div className="font-bold">
        [assistant] @{message.configuration.name} {"(sId="}
        <a
          href={`../assistants/${message.configuration.sId}`}
          target="_blank"
          className="text-action-500"
        >
          {message.configuration.sId}
        </a>
        {")"}
      </div>
      <div className="text-element-600">
        version={message.version} {message.actions.length}
      </div>
      {message.actions.map((a, i) => {
        return (
          <div key={`action-${i}`} className="pl-2 text-element-600">
            action: step={a.step} type={a.type}
          </div>
        );
      })}
      <div>{message.content}</div>
    </div>
  );
};

const ContentFragmentView = ({ message }: { message: ContentFragmentType }) => {
  return (
    <div className="ml-4 pt-2 text-sm text-element-700">
      <div className="font-bold">[content_fragment] {message.title}</div>
      <div className="text-element-600">version={message.version}</div>
      <div className="text-element-600">textBytes={message.textBytes}</div>
      {message.sourceUrl && (
        <a
          href={message.sourceUrl ?? ""}
          target="_blank"
          className="text-action-500"
        >
          [sourceUrl]
        </a>
      )}{" "}
      <a
        href={message.textUrl ?? ""}
        target="_blank"
        className="text-action-500"
      >
        [textUrl]
      </a>
    </div>
  );
};

const ConversationPage = ({
  workspaceId,
  conversationId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { conversation } = useConversation({ workspaceId, conversationId });
  const multiActionsApp =
    DustProdActionRegistry["assistant-v2-multi-actions-agent"];
  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      {conversation && (
        <div className="mx-auto max-w-4xl pt-8">
          <Page.Vertical align="stretch">
            <div className="flex space-x-2">
              <Button
                href={`http://go/trace-conversation/${conversation.sId}`}
                label="Trace Conversation"
                variant="primary"
                size="xs"
                target="_blank"
              />
              <Button
                href={`/w/${multiActionsApp.app.workspaceId}/spaces/${multiActionsApp.app.appSpaceId}/apps/${multiActionsApp.app.appId}/runs?wIdTarget=${workspaceId}`}
                label="Dust apps logs for workspace"
                variant="primary"
                size="xs"
                target="_blank"
              />
            </div>
            {conversation.content.map((messages, i) => {
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
      )}
    </div>
  );
};

export default ConversationPage;
