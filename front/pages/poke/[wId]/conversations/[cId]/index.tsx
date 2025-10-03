import {
  Button,
  CheckIcon,
  CodeBlock,
  ConversationMessage,
  Markdown,
  Page,
  Popover,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { CodeBracketIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";
import { useState } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { Action } from "@app/lib/registry";
import { getDustProdAction } from "@app/lib/registry";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { classNames } from "@app/lib/utils";
import { usePokeConversation } from "@app/poke/swr";
import type {
  ContentFragmentType,
  PokeAgentMessageType,
  UserMessageType,
  WorkspaceType,
} from "@app/types";
import { assertNever, isFileContentFragment } from "@app/types";

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

interface UserMessageViewProps {
  message: UserMessageType;
  useMarkdown: boolean;
}

const UserMessageView = ({ message, useMarkdown }: UserMessageViewProps) => {
  return (
    <div className="flex flex-grow flex-col">
      <div className="max-w-full self-end">
        <ConversationMessage
          pictureUrl={message.user?.image}
          name={message.user?.fullName ?? message.user?.username}
          type="user"
        >
          {useMarkdown ? (
            <Markdown content={message.content} />
          ) : (
            <div className="whitespace-pre-wrap">{message.content}</div>
          )}
          <div className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
            date: {new Date(message.created).toLocaleString()}
          </div>
        </ConversationMessage>
      </div>
    </div>
  );
};

interface AgentMessageViewProps {
  message: PokeAgentMessageType;
  multiActionsApp: Action;
  useMarkdown: boolean;
  workspaceId: string;
}

const AgentMessageView = ({
  message,
  multiActionsApp,
  useMarkdown,
  workspaceId,
}: AgentMessageViewProps) => {
  return (
    <div className="w-full">
      <ConversationMessage
        pictureUrl={message.configuration.pictureUrl}
        name={message.configuration.name}
        renderName={() => (
          <>
            {message.configuration.name}{" "}
            <a
              href={`/poke/${workspaceId}/assistants/${message.configuration.sId}`}
              target="_blank"
              className="text-highlight-500"
            >
              ({message.configuration.sId})
            </a>
          </>
        )}
        type="agent"
      >
        {message.content &&
          (useMarkdown ? (
            <Markdown content={message.content} />
          ) : (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ))}
        {message.error && (
          <div className="text-warning">{message.error.message}</div>
        )}
        <div className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
          date: {new Date(message.created).toLocaleString()} • message version :{" "}
          {message.version} • message sId : {message.sId} {" • "} agent sId :
          <a
            href={`/poke/${workspaceId}/assistants/${message.configuration.sId}`}
            target="_blank"
            className="text-highlight-500"
          >
            {message.configuration.sId}
          </a>
          {message.runIds && (
            <>
              {" • "}
              agent logs :{" "}
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
              className={classNames(
                "mt-1 flex items-center pl-2 text-sm text-muted-foreground dark:text-muted-foreground-night"
              )}
            >
              {a.mcpIO && (
                <Popover
                  className="max-h-60 w-[84%]"
                  content={
                    <CodeBlock wrapLongLines className="language-json">
                      {JSON.stringify(
                        {
                          params: a.mcpIO.params,
                          output: a.mcpIO.output,
                          generatedFiles: a.mcpIO.generatedFiles,
                        },
                        undefined,
                        2
                      ) ?? ""}
                    </CodeBlock>
                  }
                  trigger={
                    <Button
                      variant={a.mcpIO?.isError ? "warning" : "primary"}
                      size="xs"
                      icon={a.mcpIO?.isError ? XMarkIcon : CheckIcon}
                      className="mr-2"
                    />
                  }
                />
              )}
              {a.created && <>{new Date(a.created).toLocaleTimeString()}: </>}
              step {a.step}: <b className="px-1">{a.functionCallName}()</b>
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
      </ConversationMessage>
    </div>
  );
};

interface ContentFragmentViewProps {
  message: ContentFragmentType;
}

const ContentFragmentView = ({ message }: ContentFragmentViewProps) => {
  return (
    <div className="w-full text-sm">
      <div className="font-bold">[content_fragment] {message.title}</div>
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        date : {new Date(message.created).toLocaleString()}
        version :{message.version} {" • "}
        textBytes :{isFileContentFragment(message) ? message.textBytes : "N/A"}
      </div>
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        textBytes={isFileContentFragment(message) ? message.textBytes : "N/A"}
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
        href={isFileContentFragment(message) ? message.textUrl : ""}
        target="_blank"
        className="text-highlight-500"
      >
        [textUrl]
      </a>
    </div>
  );
};

interface ConversationPageProps
  extends InferGetServerSidePropsType<typeof getServerSideProps> {}

const ConversationPage = ({
  workspaceId,
  workspace,
  conversationId,
  conversationDataSourceId,
  multiActionsApp,
}: ConversationPageProps) => {
  const { conversation } = usePokeConversation({ workspaceId, conversationId });
  const [useMarkdown, setUseMarkdown] = useState(false);

  return (
    <>
      {conversation && (
        <div className="max-w-4xl">
          <h3 className="text-xl font-bold">
            Conversation in workspace{" "}
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
              <Button
                label={useMarkdown ? "Plain Text" : "Preview Markdown"}
                variant="secondary"
                size="xs"
                icon={useMarkdown ? DocumentTextIcon : CodeBracketIcon}
                onClick={() => setUseMarkdown(!useMarkdown)}
              />
            </div>
            <div className="flex w-full flex-1 flex-col justify-start gap-8 py-4">
              {conversation.content.map((messages, i) => {
                return (
                  <div key={`messages-${i}`} className="flex flex-col gap-4">
                    {messages.map((m, j) => {
                      switch (m.type) {
                        case "agent_message": {
                          return (
                            <AgentMessageView
                              key={`message-${i}-${j}`}
                              multiActionsApp={multiActionsApp}
                              message={m}
                              useMarkdown={useMarkdown}
                              workspaceId={workspaceId}
                            />
                          );
                        }
                        case "user_message": {
                          return (
                            <UserMessageView
                              message={m}
                              key={`message-${i}-${j}`}
                              useMarkdown={useMarkdown}
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
            </div>
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
