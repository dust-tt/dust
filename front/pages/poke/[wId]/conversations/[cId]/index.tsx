import { Button, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { Action } from "@app/lib/registry";
import { getDustProdAction } from "@app/lib/registry";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { usePokeConversation } from "@app/poke/swr";
import type {
  ContentFragmentType,
  PokeAgentMessageType,
  UserMessageType,
  WorkspaceType,
} from "@app/types";
import { assertNever } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  workspace: WorkspaceType;
  workspaceId: string;
  conversationId: string;
  conversationDataSourceId: string | null;
  multiActionsApp: Action;
}>(async (context, auth) => {
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

  const cRes = await ConversationResource.fetchConversationWithoutContent(
    auth,
    cId
  );
  if (cRes.isErr()) {
    return {
      notFound: true,
    };
  }

  const conversationDataSource = await DataSourceResource.fetchByConversation(
    auth,
    cRes.value
  );

  const multiActionsApp = getDustProdAction("assistant-v2-multi-actions-agent");

  return {
    props: {
      workspaceId: wId,
      conversationId: cId,
      conversationDataSourceId: conversationDataSource?.sId ?? null,
      multiActionsApp,
      workspace: auth.getNonNullableWorkspace(),
    },
  };
});

const UserMessageView = ({ message }: { message: UserMessageType }) => {
  return (
    <div className="ml-4 pt-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
      {message.user && (
        <div className="font-bold">
          [user] @{message.user.username} (fullName={message.user.fullName}{" "}
          email=
          {message.user.email}) (posted{" "}
          {new Date(message.created).toLocaleString()})
        </div>
      )}
      <div className="text-muted-foreground dark:text-muted-foreground-night">
        version={message.version}
      </div>
      <div>{message.content}</div>
    </div>
  );
};

const AgentMessageView = ({
  message,
  multiActionsApp,
  workspaceId,
}: {
  message: PokeAgentMessageType;
  multiActionsApp: Action;
  workspaceId: string;
}) => {
  return (
    <div className="ml-4 pt-2 text-sm text-muted-foreground">
      <div className="font-bold">
        [agent] @{message.configuration.name} {"(sId="}
        <a
          href={`/poke/${workspaceId}/assistants/${message.configuration.sId}`}
          target="_blank"
          className="text-highlight-500"
        >
          {message.configuration.sId}
        </a>
        {")"}(posted {new Date(message.created).toLocaleString()})
      </div>

      <div className="text-muted-foreground dark:text-muted-foreground-night">
        version={message.version}
        {message.runIds && (
          <>
            , agent logs:{" "}
            {message.runIds.map((runId, i) => (
              <a
                key={`runId-${i}`}
                href={`/w/${multiActionsApp.app.workspaceId}/spaces/${multiActionsApp.app.appSpaceId}/apps/${multiActionsApp.app.appId}/runs/${runId}`}
                target="_blank"
                className="text-highlight-500"
              >
                {runId.substring(0, 8)}{" "}
              </a>
            ))}
          </>
        )}
      </div>
      {message.actions.map((a, i) => {
        return (
          <div
            key={`action-${i}`}
            className="pl-2 text-muted-foreground dark:text-muted-foreground-night"
          >
            action: step={a.step} type={a.type}{" "}
            {a.runId && (
              <>
                log:{" "}
                <a
                  key={`runId-${i}`}
                  href={`/w/${a.appWorkspaceId}/spaces/${a.appSpaceId}/apps/${a.appId}/runs/${a.runId}`}
                  target="_blank"
                  className="text-highlight-500"
                >
                  {a.runId.substring(0, 8)}{" "}
                </a>
              </>
            )}
          </div>
        );
      })}
      {message.content && <div>{message.content}</div>}
      {message.error && (
        <div className="text-warning">{message.error.message}</div>
      )}
    </div>
  );
};

const ContentFragmentView = ({ message }: { message: ContentFragmentType }) => {
  return (
    <div className="ml-4 pt-2 text-sm text-muted-foreground">
      <div className="font-bold">
        [content_fragment] {message.title} (posted{" "}
        {new Date(message.created).toLocaleString()})
      </div>
      <div className="text-muted-foreground dark:text-muted-foreground-night">
        version={message.version}
      </div>
      <div className="text-muted-foreground dark:text-muted-foreground-night">
        textBytes={message.textBytes}
      </div>
      {message.sourceUrl && (
        <a
          href={message.sourceUrl ?? ""}
          target="_blank"
          className="text-highlight-500"
        >
          [sourceUrl]
        </a>
      )}{" "}
      <a
        href={message.textUrl ?? ""}
        target="_blank"
        className="text-highlight-500"
      >
        [textUrl]
      </a>
    </div>
  );
};

const ConversationPage = ({
  workspaceId,
  workspace,
  conversationId,
  conversationDataSourceId,
  multiActionsApp,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { conversation } = usePokeConversation({ workspaceId, conversationId });

  return (
    <>
      {conversation && (
        <div className="max-w-4xl">
          <h3 className="text-xl font-bold">
            Conversation of workspace:{" "}
            <a href={`/poke/${workspaceId}`} className="text-highlight-500">
              {workspace.name}
            </a>
          </h3>
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
                href={`/poke/${workspaceId}/data_sources/${conversationDataSourceId}`}
                label="Conversation DS"
                variant="primary"
                size="xs"
                target="_blank"
                enabled={!!conversationDataSourceId}
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
                            key={`message-${i}-${j}`}
                            multiActionsApp={multiActionsApp}
                            message={m}
                            workspaceId={workspaceId}
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
    </>
  );
};

ConversationPage.getLayout = (
  page: ReactElement,
  { workspace }: { workspace: WorkspaceType }
) => {
  return (
    <PokeLayout title={`${workspace.name} - Conversation`}>{page}</PokeLayout>
  );
};

export default ConversationPage;
