import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useRequiredPathParam } from "@app/lib/platform";
import { classNames } from "@app/lib/utils";
import { usePokeConversation } from "@app/poke/swr";
import { usePokeAgentConfigurations } from "@app/poke/swr/agent_configurations";
import { usePokeConversationConfig } from "@app/poke/swr/conversation_config";
import type { UserMessageType } from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isFileContentFragment } from "@app/types/content_fragment";
import type { PokeAgentMessageType } from "@app/types/poke";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  CheckIcon,
  ChevronDownIcon,
  Chip,
  ClipboardCheckIcon,
  ClipboardIcon,
  CodeBlock,
  ConversationMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  LinkWrapper,
  Markdown,
  Page,
  Spinner,
  useCopyToClipboard,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { CodeBracketIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";

interface UserMessageViewProps {
  message: UserMessageType;
  useMarkdown: boolean;
}

const UserMessageView = ({ message, useMarkdown }: UserMessageViewProps) => {
  const hasDustSystemTag = message.content.includes("<dust_system>");
  const [isExpanded, setIsExpanded] = useState(!hasDustSystemTag);

  return (
    <div className="flex flex-grow flex-col">
      <div className="max-w-full self-end">
        <ConversationMessage
          pictureUrl={message.user?.image}
          name={message.user?.fullName ?? message.user?.username}
          type="user"
        >
          {hasDustSystemTag && !isExpanded ? (
            <button
              onClick={() => setIsExpanded(true)}
              className="flex cursor-pointer items-center gap-1 text-sm italic text-muted-foreground hover:text-foreground dark:text-muted-foreground-night dark:hover:text-foreground-night"
            >
              <ChevronDownIcon className="h-4 w-4" />
              <span>Hidden System Message (click to expand)</span>
            </button>
          ) : (
            <>
              {hasDustSystemTag && (
                <button
                  onClick={() => setIsExpanded(false)}
                  className="mb-2 flex cursor-pointer items-center gap-1 text-sm italic text-muted-foreground hover:text-foreground dark:text-muted-foreground-night dark:hover:text-foreground-night"
                >
                  <XMarkIcon className="h-4 w-4" />
                  <span>Hide System Message</span>
                </button>
              )}
              {useMarkdown ? (
                <Markdown content={message.content} />
              ) : (
                <div className="whitespace-pre-wrap">{message.content}</div>
              )}
            </>
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
  useMarkdown: boolean;
  owner: LightWorkspaceType;
  langfuseUiBaseUrl: string | null;
}

const AgentMessageView = ({
  message,
  useMarkdown,
  owner,
  langfuseUiBaseUrl,
}: AgentMessageViewProps) => {
  const [expandedActions, setExpandedActions] = useState<Set<number>>(
    new Set()
  );

  const toggleAction = (index: number) => {
    setExpandedActions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="w-full">
      <ConversationMessage
        pictureUrl={message.configuration.pictureUrl}
        name={message.configuration.name}
        renderName={() => (
          <>
            {message.configuration.name}{" "}
            <LinkWrapper
              href={`/poke/${owner.sId}/assistants/${message.configuration.sId}`}
              target="_blank"
              className="text-highlight-500"
            >
              ({message.configuration.sId})
            </LinkWrapper>
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
          <LinkWrapper
            href={`/poke/${owner.sId}/assistants/${message.configuration.sId}`}
            target="_blank"
            className="text-highlight-500"
          >
            {message.configuration.sId}
          </LinkWrapper>
          {message.runUrls && (
            <>
              {" • "}
              agent logs :{" "}
              {message.runUrls.map(({ runId, url, isLLM }, i) => (
                <span
                  key={`runId-${i}`}
                  className="inline-flex items-center space-x-1"
                >
                  <a href={url} target="_blank" className="text-highlight-500">
                    {runId.substring(0, 16)}
                  </a>
                  {isLLM && (
                    <>
                      <span className="rounded-sm bg-blue-100 px-1 py-0.5 text-xs text-blue-800">
                        LLM
                      </span>
                      {langfuseUiBaseUrl && (
                        <a
                          href={`${langfuseUiBaseUrl}/traces?filter=metadata%3BstringObject%3BdustTraceId%3B%3D%3B${runId}`}
                          target="_blank"
                          className="text-highlight-500"
                          title="View in Langfuse"
                        >
                          [LF]
                        </a>
                      )}
                    </>
                  )}{" "}
                </span>
              ))}
            </>
          )}
        </div>
        {message.actions.map((a, i) => {
          const isExpanded = expandedActions.has(i);
          return (
            <div key={`action-${i}`} className="mt-1">
              <div
                className={classNames(
                  "flex items-center pl-2 text-sm text-muted-foreground dark:text-muted-foreground-night"
                )}
              >
                {a.mcpIO && (
                  <Button
                    variant={a.mcpIO?.isError ? "warning" : "primary"}
                    size="xs"
                    icon={
                      isExpanded
                        ? ChevronDownIcon
                        : a.mcpIO?.isError
                          ? XMarkIcon
                          : CheckIcon
                    }
                    className="mr-2"
                    onClick={() => toggleAction(i)}
                  />
                )}
                {a.created && <>{new Date(a.created).toLocaleTimeString()}: </>}
                step {a.step}: <b className="px-1">{a.functionCallName}()</b>
                {"executionDurationMs" in a &&
                  typeof a.executionDurationMs === "number" && (
                    <span className="ml-1 text-xs">
                      ({(a.executionDurationMs / 1000).toFixed(1)}s)
                    </span>
                  )}
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
              {a.mcpIO && isExpanded && (
                <div className="ml-8 mt-2">
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
                </div>
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
        href={isFileContentFragment(message) ? (message.textUrl ?? "") : ""}
        target="_blank"
        className="text-highlight-500"
      >
        [textUrl]
      </a>
    </div>
  );
};

export function ConversationPage() {
  const owner = useWorkspace();
  useSetPokePageTitle(`${owner.name} - Conversation`);

  const conversationId = useRequiredPathParam("cId");
  const {
    data: conversationConfig,
    isLoading: isConfigLoading,
    isError: isConfigError,
  } = usePokeConversationConfig({
    owner,
    conversationId,
    disabled: false,
  });

  const { conversation } = usePokeConversation({
    workspaceId: owner.sId,
    conversationId,
  });
  const [useMarkdown, setUseMarkdown] = useState(false);
  const { data: agents } = usePokeAgentConfigurations({
    owner,
    agentsGetView: "admin_internal",
  });

  const defaultAgentId = (() => {
    const lastAgentMessage = conversation?.content
      .map((versions) => versions[versions.length - 1])
      .reverse()
      .find((m) => m.type === "agent_message") as
      | PokeAgentMessageType
      | undefined;
    return lastAgentMessage?.configuration.sId ?? agents[0]?.sId ?? "";
  })();

  const [selectedAgentId, setSelectedAgentId] =
    useState<string>(defaultAgentId);
  const [contextSizeOverride, setContextSizeOverride] = useState<string>("");
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderResult, setRenderResult] = useState<null | {
    tokensUsed: number;
    modelContextSizeUsed: number;
    modelConversation: unknown;
    promptTokenCountApprox: number;
    toolsTokenCountApprox: number;
  }>(null);
  const [showRenderControls, setShowRenderControls] = useState(false);
  const [isCopiedJSON, copyJSON] = useCopyToClipboard();

  useEffect(() => {
    if (!selectedAgentId) {
      if (defaultAgentId) {
        setSelectedAgentId(defaultAgentId);
      }
    }
  }, [defaultAgentId, selectedAgentId]);

  async function handleRenderConversation() {
    if (!selectedAgentId) {
      setRenderError("Select an agent sId first.");
      return;
    }
    setIsRendering(true);
    setRenderError(null);
    setRenderResult(null);
    try {
      const response = await clientFetch(
        `/api/poke/workspaces/${owner.sId}/conversations/${conversationId}/render`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: selectedAgentId,
            contextSizeOverride: contextSizeOverride
              ? Number(contextSizeOverride)
              : null,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        throw new Error(data.error?.message || "Failed to render conversation");
      }
      setRenderResult({
        tokensUsed: data.tokensUsed,
        modelContextSizeUsed: data.modelContextSizeUsed,
        modelConversation: data.modelConversation,
        promptTokenCountApprox: data.promptTokenCountApprox,
        toolsTokenCountApprox: data.toolsTokenCountApprox,
      });
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsRendering(false);
    }
  }

  if (isConfigLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isConfigError || !conversationConfig) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading conversation config.</p>
      </div>
    );
  }

  const { conversationDataSourceId, langfuseUiBaseUrl, temporalWorkspace } =
    conversationConfig;

  return (
    conversation && (
      <div className="max-w-4xl">
        <h3 className="text-xl font-bold">
          Conversation in workspace{" "}
          <LinkWrapper
            href={`/poke/${owner.sId}`}
            className="text-highlight-500"
          >
            {owner.name}
          </LinkWrapper>
        </h3>
        <Page.Vertical align="stretch">
          <div className="flex space-x-2">
            {langfuseUiBaseUrl && (
              <Button
                href={`${langfuseUiBaseUrl}/traces?filter=metadata%3BstringObject%3BconversationId%3B%3D%3B${conversationId}`}
                label="Langfuse Traces"
                variant="primary"
                size="xs"
                target="_blank"
              />
            )}
            <Button
              href={`http://go/trace-conversation/${conversation.sId}`}
              label="Trace Conversation"
              variant="primary"
              size="xs"
              target="_blank"
            />
            <Button
              href={`https://cloud.temporal.io/namespaces/${temporalWorkspace}/workflows?query=%60conversationId%60%3D"${conversationId}"`}
              label="Temporal Workflows"
              variant="primary"
              size="xs"
              target="_blank"
            />
            <Button
              href={`/poke/${owner.sId}/data_sources/${conversationDataSourceId}`}
              label="Conversation DS"
              variant="primary"
              size="xs"
              target="_blank"
              disabled={!conversationDataSourceId}
            />
            <Button
              label={useMarkdown ? "Plain Text" : "Preview Markdown"}
              variant="outline"
              size="xs"
              icon={useMarkdown ? DocumentTextIcon : CodeBracketIcon}
              onClick={() => setUseMarkdown(!useMarkdown)}
            />
            <Button
              label="Render Conversation"
              variant="primary"
              size="xs"
              onClick={() => {
                if (!showRenderControls) {
                  setShowRenderControls(true);
                  return;
                }
                void handleRenderConversation();
              }}
              disabled={isRendering}
            />
            {isRendering && <Spinner size="xs" />}
            {showRenderControls && (
              <div className="ml-2 flex items-center space-x-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      label={
                        selectedAgentId
                          ? `Agent: ${
                              agents.find((a) => a.sId === selectedAgentId)
                                ?.name ?? selectedAgentId
                            }`
                          : "Select Agent"
                      }
                      variant="outline"
                      size="xs"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {agents.map((a) => (
                      <DropdownMenuItem
                        key={a.sId}
                        onClick={() => setSelectedAgentId(a.sId)}
                      >
                        {a.name} ({a.sId})
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Input
                  placeholder="Context size override"
                  value={contextSizeOverride}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setContextSizeOverride(e.target.value)
                  }
                  className="h-7 w-44"
                />
              </div>
            )}
          </div>
          {(renderError !== null || renderResult !== null) && (
            <div className="mt-2 rounded-md border p-2">
              {renderError && <div className="text-warning">{renderError}</div>}
              {renderResult && (
                <div className="flex flex-col space-y-2">
                  <div className="flex items-center space-x-2">
                    <Chip
                      color="blue"
                      label={`Tokens used: ${renderResult.tokensUsed}`}
                      size="xs"
                    />
                    <Chip
                      color="info"
                      label={`Context size: ${renderResult.modelContextSizeUsed}`}
                      size="xs"
                    />
                    <Chip
                      color="highlight"
                      label={`Prompt tokens: ${renderResult.promptTokenCountApprox}`}
                      size="xs"
                    />
                    <Chip
                      color="green"
                      label={`Tools tokens: ${renderResult.toolsTokenCountApprox}`}
                      size="xs"
                    />
                    <Button
                      label={isCopiedJSON ? "Copied" : "Copy JSON"}
                      variant="outline"
                      size="xs"
                      icon={isCopiedJSON ? ClipboardCheckIcon : ClipboardIcon}
                      onClick={() =>
                        copyJSON(
                          JSON.stringify(
                            renderResult.modelConversation,
                            null,
                            2
                          )
                        )
                      }
                    />
                    <Button
                      label="Close"
                      variant="outline"
                      size="xs"
                      icon={XMarkIcon}
                      onClick={() => {
                        setRenderError(null);
                        setRenderResult(null);
                      }}
                    />
                  </div>
                  <CodeBlock wrapLongLines className="language-json">
                    {JSON.stringify(renderResult.modelConversation, null, 2)}
                  </CodeBlock>
                </div>
              )}
            </div>
          )}
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
                            message={m}
                            useMarkdown={useMarkdown}
                            owner={owner}
                            langfuseUiBaseUrl={langfuseUiBaseUrl}
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
    )
  );
}
