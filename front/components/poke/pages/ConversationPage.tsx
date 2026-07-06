import { PluginList } from "@app/components/poke/plugins/PluginList";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokeConversation } from "@app/poke/swr";
import { usePokeAgentConfigurations } from "@app/poke/swr/agent_configurations";
import { usePokeConversationConfig } from "@app/poke/swr/conversation_config";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import { useCopyReinforcementTestCase } from "@app/poke/swr/reinforcement_test_case";
import { usePokeSpaceDetails } from "@app/poke/swr/space_details";
import type {
  AgentMessageStatus,
  CompactionMessageStatus,
  CompactionMessageType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isFileContentFragment } from "@app/types/content_fragment";
import type { PokeAgentMessageType } from "@app/types/poke";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Check,
  ChevronDown,
  Chip,
  Clipboard,
  ClipboardCheck,
  CodeBlock,
  ConversationMessage,
  cn,
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
  XClose,
} from "@dust-tt/sparkle";
import { CodeBracketIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useState,
} from "react";

type ChipColor = NonNullable<ComponentProps<typeof Chip>["color"]>;

const USER_VISIBILITY: Record<string, { label: string; color: ChipColor }> = {
  visible: { label: "sent", color: "success" },
  pending: { label: "queued", color: "warning" },
  deleted: { label: "deleted", color: "warning" },
};

const AGENT_STATUS: Record<
  AgentMessageStatus,
  { label: string; color: ChipColor }
> = {
  created: { label: "generating", color: "warning" },
  succeeded: { label: "succeeded", color: "success" },
  failed: { label: "failed", color: "warning" },
  cancelled: { label: "cancelled", color: "primary" },
  interrupted: { label: "cancelled", color: "primary" },
  gracefully_stopped: {
    label: "stopped",
    color: "primary",
  },
};

const COMPACTION_STATUS: Record<
  CompactionMessageStatus,
  { label: string; color: ChipColor }
> = {
  created: { label: "generating", color: "warning" },
  succeeded: { label: "succeeded", color: "success" },
  failed: { label: "failed", color: "warning" },
};

function getLangfuseTraceUrl(langfuseUiBaseUrl: string, runId: string) {
  return `${langfuseUiBaseUrl}/traces?filter=metadata%3BstringObject%3BdustTraceId%3B%3D%3B${encodeURIComponent(runId)}`;
}

function formatDurationMs(durationMs: number) {
  return durationMs >= 1000
    ? `${(durationMs / 1000).toFixed(1)}s`
    : `${durationMs}ms`;
}

interface StatusBadgeProps {
  label: string;
  color: ChipColor;
}

function StatusBadge({ label, color }: StatusBadgeProps) {
  return <Chip color={color} label={label} size="xs" />;
}

interface MetadataItemProps {
  label: string;
  children: ReactNode;
  mono?: boolean;
}

function MetadataItem({ label, children, mono }: MetadataItemProps) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-sm text-foreground",
          mono ? "font-mono tabular-nums" : null
        )}
      >
        {children}
      </span>
    </span>
  );
}

interface AgentTraceLinksProps {
  runUrls: NonNullable<PokeAgentMessageType["runUrls"]>;
  langfuseUiBaseUrl: string | null;
}

function AgentTraceLinks({ runUrls, langfuseUiBaseUrl }: AgentTraceLinksProps) {
  return (
    <MetadataItem label={runUrls.length > 1 ? "traces" : "trace"} mono>
      {runUrls.map(({ runId, url, isLLM }, index) => {
        const traceLabelSuffix = runUrls.length > 1 ? ` ${index + 1}` : "";

        return (
          <span key={runId} className="inline-flex items-center">
            {index > 0 && <span className="px-1 text-muted-foreground">,</span>}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={runId}
              className="font-sans text-highlight hover:underline"
            >
              Poke{traceLabelSuffix}
            </a>
            {isLLM && langfuseUiBaseUrl && (
              <>
                <span className="px-1 text-muted-foreground">·</span>
                <a
                  href={getLangfuseTraceUrl(langfuseUiBaseUrl, runId)}
                  title={`Open ${runId} in Langfuse`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans text-highlight hover:underline"
                >
                  Langfuse{traceLabelSuffix}
                </a>
              </>
            )}
          </span>
        );
      })}
    </MetadataItem>
  );
}

function getActionLabel(action: PokeAgentMessageType["actions"][number]) {
  return action.displayLabels?.done ?? action.functionCallName;
}

function getActionStatus(
  status: PokeAgentMessageType["actions"][number]["status"]
): null | {
  color: ChipColor;
  label: string;
} {
  switch (status) {
    case "succeeded":
      return null;
    case "errored":
      return { label: "error", color: "warning" };
    case "denied":
      return { label: "denied", color: "primary" };
    case "running":
      return { label: "running", color: "highlight" };
    case "ready_allowed_explicitly":
    case "ready_allowed_implicitly":
      return { label: "ready", color: "primary" };
    case "blocked_authentication_required":
    case "blocked_child_action_input_required":
    case "blocked_file_authorization_required":
    case "blocked_user_answer_required":
    case "blocked_validation_required":
      return { label: "blocked", color: "warning" };
    default:
      assertNeverAndIgnore(status);
      return { label: status, color: "primary" };
  }
}

interface ToolActionViewProps {
  action: PokeAgentMessageType["actions"][number];
  isExpanded: boolean;
  onToggle: () => void;
}

function ToolActionContent({
  action,
  isExpanded,
  onToggle,
}: ToolActionViewProps) {
  const actionStatus = getActionStatus(action.status);
  const ActionIcon = action.status === "errored" ? XClose : Check;
  const actionLabel = getActionLabel(action);
  const duration =
    "executionDurationMs" in action &&
    typeof action.executionDurationMs === "number"
      ? formatDurationMs(action.executionDurationMs)
      : "—";

  return (
    <>
      <span className="shrink-0">
        {action.mcpIO ? (
          <Button
            variant="outline"
            size="icon"
            icon={
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  !isExpanded ? "-rotate-90" : null
                )}
              />
            }
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-label={
              isExpanded ? "Collapse tool details" : "Expand tool details"
            }
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-separator bg-background">
            <ActionIcon className="h-4 w-4 text-muted-foreground" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="w-24 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
          {action.created ? new Date(action.created).toLocaleTimeString() : "—"}
        </span>
        <span className="shrink-0 rounded-md border border-separator bg-background px-1.5 py-0.5 font-mono text-sm tabular-nums text-muted-foreground">
          Step {action.step}
        </span>
        <span
          className="min-w-0 truncate text-sm font-medium text-foreground"
          title={
            actionLabel === action.functionCallName
              ? action.functionCallName
              : `${actionLabel} (${action.functionCallName})`
          }
        >
          {actionLabel}
        </span>
        {actionStatus && (
          <Chip
            color={actionStatus.color}
            label={actionStatus.label}
            size="xs"
          />
        )}
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">
        {duration}
      </span>
      <span className="w-8 shrink-0 text-right">
        {action.runId && (
          <a
            href={`/w/${action.appWorkspaceId}/spaces/${action.appSpaceId}/apps/${action.appId}/runs/${action.runId}`}
            title={action.runId}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-highlight hover:underline"
          >
            Run
          </a>
        )}
      </span>
    </>
  );
}

function ToolActionView({ action, isExpanded, onToggle }: ToolActionViewProps) {
  return (
    <div>
      <div
        className={cn(
          "mt-2 flex w-full items-center gap-2 rounded-md border border-separator bg-muted-background px-2 py-1.5 text-left",
          action.status === "errored"
            ? "border-border-warning bg-background"
            : null
        )}
      >
        <ToolActionContent
          action={action}
          isExpanded={isExpanded}
          onToggle={onToggle}
        />
      </div>
      {action.mcpIO && isExpanded && (
        <div className="ml-9 mt-2 overflow-hidden rounded-md border border-separator bg-background">
          <CodeBlock wrapLongLines className="language-json">
            {JSON.stringify(
              {
                params: action.mcpIO.params,
                output: action.mcpIO.output,
                generatedFiles: action.mcpIO.generatedFiles,
              },
              undefined,
              2
            )}
          </CodeBlock>
        </div>
      )}
    </div>
  );
}

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
              className="flex cursor-pointer items-center gap-1 text-sm italic text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className="h-4 w-4" />
              <span>Hidden System Message (click to expand)</span>
            </button>
          ) : (
            <>
              {hasDustSystemTag && (
                <button
                  onClick={() => setIsExpanded(false)}
                  className="mb-2 flex cursor-pointer items-center gap-1 text-sm italic text-muted-foreground hover:text-foreground"
                >
                  <XClose className="h-4 w-4" />
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
          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <span>date: {new Date(message.created).toLocaleString()}</span>
            <StatusBadge
              label={
                USER_VISIBILITY[message.visibility]?.label ?? message.visibility
              }
              color={USER_VISIBILITY[message.visibility]?.color ?? "primary"}
            />
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
  const [expandedActions, setExpandedActions] = useState<Set<string>>(
    new Set()
  );

  const toggleAction = (actionId: string) => {
    setExpandedActions((prev) => {
      const next = new Set(prev);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else {
        next.add(actionId);
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
              className="text-highlight"
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
          <div className="my-3 rounded-md border border-border-warning bg-background px-3 py-2 text-sm font-medium text-warning">
            {message.error.message}
          </div>
        )}
        <div className="mt-3 rounded-md border border-separator bg-muted-background px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <StatusBadge
              label={AGENT_STATUS[message.status]?.label ?? message.status}
              color={AGENT_STATUS[message.status]?.color ?? "primary"}
            />
            <MetadataItem label="date" mono>
              {new Date(message.created).toLocaleString()}
            </MetadataItem>
            <MetadataItem label="version" mono>
              {message.version}
            </MetadataItem>
            <MetadataItem label="message" mono>
              {message.sId}
            </MetadataItem>
            <MetadataItem label="agent">
              <LinkWrapper
                href={`/poke/${owner.sId}/assistants/${message.configuration.sId}`}
                target="_blank"
                className="font-mono text-highlight hover:underline"
              >
                {message.configuration.sId}
              </LinkWrapper>
            </MetadataItem>
            {message.modelInteractionDurationMs != null && (
              <MetadataItem label="LLM" mono>
                {formatDurationMs(message.modelInteractionDurationMs)}
              </MetadataItem>
            )}
            {message.completionDurationMs != null && (
              <MetadataItem label="total" mono>
                {formatDurationMs(message.completionDurationMs)}
              </MetadataItem>
            )}
            {message.runUrls && message.runUrls.length > 0 && (
              <AgentTraceLinks
                runUrls={message.runUrls}
                langfuseUiBaseUrl={langfuseUiBaseUrl}
              />
            )}
          </div>
        </div>
        {message.actions.map((a) => {
          const isExpanded = expandedActions.has(a.sId);
          return (
            <ToolActionView
              key={a.sId}
              action={a}
              isExpanded={isExpanded}
              onToggle={() => toggleAction(a.sId)}
            />
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
      <div className="text-sm text-muted-foreground">
        date : {new Date(message.created).toLocaleString()} {" • "}
        version :{message.version} {" • "}
        textBytes :{isFileContentFragment(message) ? message.textBytes : "N/A"}
      </div>
      <div className="text-sm text-muted-foreground">
        textBytes={isFileContentFragment(message) ? message.textBytes : "N/A"}
      </div>
      {message.sourceUrl && (
        <a
          href={message.sourceUrl ?? ""}
          target="_blank"
          className="text-highlight"
        >
          [sourceUrl]
        </a>
      )}{" "}
      <a
        href={isFileContentFragment(message) ? (message.textUrl ?? "") : ""}
        target="_blank"
        className="text-highlight"
      >
        [textUrl]
      </a>
    </div>
  );
};

interface CompactionMessageViewProps {
  message: CompactionMessageType;
}

const CompactionMessageView = ({ message }: CompactionMessageViewProps) => {
  return (
    <div className="w-full text-sm">
      <div className="font-bold">[compaction]</div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <StatusBadge
          label={COMPACTION_STATUS[message.status]?.label ?? message.status}
          color={COMPACTION_STATUS[message.status]?.color ?? "primary"}
        />
        date : {new Date(message.created).toLocaleString()} {" • "}
        version :{message.version}
      </div>
      {message.content && <Markdown content={message.content || ""} />}
    </div>
  );
};

const ONE_HOUR_MS = 60 * 60 * 1000;

function getDatadogSandboxLogsUrl(conversationId: string): string {
  const nowMs = Date.now();
  const fromMs = nowMs - ONE_HOUR_MS;
  const query = `service:sandbox-runner @conversation_id:${conversationId}`;

  return `https://app.datadoghq.eu/logs?query=${encodeURIComponent(query)}&cols=service,@timestamp_utc&from_ts=${fromMs}&to_ts=${nowMs}&live=true`;
}

export function ConversationPage() {
  const owner = useWorkspace();

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

  usePokePageMetadata({
    name: conversation?.title,
    subtitle: owner.name,
    sId: conversationId,
  });

  const { data: spaceDetails } = usePokeSpaceDetails({
    owner,
    spaceId: conversation?.spaceId ?? "",
    disabled: !conversation?.spaceId,
  });
  const pod =
    spaceDetails?.space.kind === "project" ? spaceDetails.space : null;

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

  const { copyTestCase, isLoading: isTestCaseLoading } =
    useCopyReinforcementTestCase({ owner, conversationId });

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

  const allMessages = conversation?.content.flat() ?? [];
  const pendingUserCount = allMessages.filter(
    (m) => m.type === "user_message" && m.visibility === "pending"
  ).length;
  const createdAgentCount = allMessages.filter(
    (m) => m.type === "agent_message" && m.status === "created"
  ).length;

  return (
    conversation && (
      <div className="max-w-6xl">
        <h3 className="text-xl font-bold">
          Conversation in workspace{" "}
          <LinkWrapper href={`/poke/${owner.sId}`} className="text-highlight">
            {owner.name}
          </LinkWrapper>
          {pod && (
            <>
              {" "}
              in pod{" "}
              <LinkWrapper
                href={`/poke/${owner.sId}/spaces/${pod.sId}`}
                className="text-highlight"
              >
                {pod.name}
              </LinkWrapper>
            </>
          )}
        </h3>
        <Page.Vertical align="stretch">
          <PluginList
            pluginResourceTarget={{
              resourceId: conversation.sId,
              resourceType: "conversations",
              workspace: owner,
            }}
          />
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
              href={getDatadogSandboxLogsUrl(conversationId)}
              label="Sandbox Logs"
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
            <Button
              label="Self-improving skills test"
              variant="primary"
              size="xs"
              onClick={() => void copyTestCase()}
              disabled={isTestCaseLoading}
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
                      color="highlight"
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
                      color="success"
                      label={`Tools tokens: ${renderResult.toolsTokenCountApprox}`}
                      size="xs"
                    />
                    <Button
                      label={isCopiedJSON ? "Copied" : "Copy JSON"}
                      variant="outline"
                      size="xs"
                      icon={isCopiedJSON ? ClipboardCheck : Clipboard}
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
                      icon={XClose}
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
          {(pendingUserCount > 0 || createdAgentCount > 0) && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-warning bg-background px-3 py-2 text-sm text-warning">
              <span className="text-sm font-medium text-warning">
                Active messages
              </span>
              {pendingUserCount > 0 && (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border-warning bg-muted-background px-2 text-sm text-foreground">
                  <span className="font-mono tabular-nums">
                    {pendingUserCount}
                  </span>
                  user message
                  {pendingUserCount > 1 ? "s" : ""} queued
                </span>
              )}
              {createdAgentCount > 0 && (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border-warning bg-muted-background px-2 text-sm text-foreground">
                  <span className="font-mono tabular-nums">
                    {createdAgentCount}
                  </span>
                  agent message
                  {createdAgentCount > 1 ? "s" : ""} generating
                </span>
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
                      case "compaction_message": {
                        return (
                          <CompactionMessageView
                            message={m}
                            key={`message-${i}-${j}`}
                          />
                        );
                      }
                      default:
                        assertNeverAndIgnore(m);
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
