import type { PokeGetConversationConfig } from "@app/lib/api/poke/conversations";
import { makeSandboxConnectCommand } from "@app/lib/poke/sandbox";
import { usePokeAgentConfigurations } from "@app/poke/swr/agent_configurations";
import { usePokeRenderConversation } from "@app/poke/swr/conversation_render";
import { useCopyReinforcementTestCase } from "@app/poke/swr/reinforcement_test_case";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Chip,
  Clipboard,
  ClipboardCheck,
  CodeBlock,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DatadogLogo,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  LangfuseLogo,
  Spinner,
  TemporalLogo,
  useCopyToClipboard,
  XClose,
} from "@dust-tt/sparkle";
import { useState } from "react";

const ONE_HOUR_MS = 60 * 60 * 1000;

function getDatadogSandboxLogsUrl(conversationId: string): string {
  const nowMs = Date.now();
  const fromMs = nowMs - ONE_HOUR_MS;
  const query = `service:sandbox-runner @conversation_id:${conversationId}`;

  return `https://app.datadoghq.eu/logs?query=${encodeURIComponent(query)}&cols=service,@timestamp_utc&from_ts=${fromMs}&to_ts=${nowMs}&live=true`;
}

interface ConversationActionsProps {
  owner: LightWorkspaceType;
  conversationId: string;
  conversation: ConversationType;
  conversationConfig: PokeGetConversationConfig;
}

export function ConversationActions({
  owner,
  conversationId,
  conversation,
  conversationConfig,
}: ConversationActionsProps) {
  const { langfuseUiBaseUrl, sandbox, temporalWorkspace } = conversationConfig;
  const { data: agents } = usePokeAgentConfigurations({
    owner,
    agentsGetView: "admin_internal",
  });

  const lastAgentMessage = conversation.content
    .map((versions) => versions[versions.length - 1])
    .reverse()
    .find((m) => m.type === "agent_message");
  const defaultAgentId =
    lastAgentMessage?.configuration.sId ?? agents[0]?.sId ?? "";

  const [agentSelection, setAgentSelection] = useState<{
    agentId: string;
    conversationId: string;
  } | null>(null);
  const selectedAgentId =
    agentSelection?.conversationId === conversationId
      ? agentSelection.agentId
      : defaultAgentId;
  const [contextSizeOverride, setContextSizeOverride] = useState<string>("");
  const [showRenderControls, setShowRenderControls] = useState(false);
  const [isCopiedJSON, copyJSON] = useCopyToClipboard();
  const [isCopiedSandboxCommand, copySandboxCommand] = useCopyToClipboard();
  const { copyTestCase, isLoading: isTestCaseLoading } =
    useCopyReinforcementTestCase({ owner, conversationId });

  const sandboxConnect = sandbox
    ? { command: makeSandboxConnectCommand(sandbox), status: sandbox.status }
    : null;

  const {
    isRendering,
    renderError,
    renderResult,
    renderConversation,
    clearRenderResult,
  } = usePokeRenderConversation({ owner, conversationId });
  const handleRenderConversation = () =>
    renderConversation(selectedAgentId, contextSizeOverride);

  return (
    <>
      <div className="flex w-full max-w-5xl flex-col items-start gap-3">
        <div className="flex flex-wrap gap-2">
          {langfuseUiBaseUrl && (
            <Button
              href={`${langfuseUiBaseUrl}/traces?filter=metadata%3BstringObject%3BconversationId%3B%3D%3B${conversationId}`}
              label="Langfuse"
              icon={LangfuseLogo}
              variant="outline"
              size="xs"
              target="_blank"
            />
          )}
          <Button
            href={`http://go/trace-conversation/${conversation.sId}`}
            label="Datadog"
            icon={DatadogLogo}
            variant="outline"
            size="xs"
            target="_blank"
          />
          <Button
            href={`https://cloud.temporal.io/namespaces/${temporalWorkspace}/workflows?query=%60conversationId%60%3D"${conversationId}"`}
            label="Temporal"
            icon={TemporalLogo}
            variant="outline"
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
            label={isCopiedSandboxCommand ? "Copied" : "Sandbox Cmd"}
            variant="primary"
            size="xs"
            icon={isCopiedSandboxCommand ? ClipboardCheck : Clipboard}
            disabled={!sandboxConnect}
            tooltip={
              sandboxConnect
                ? `${sandboxConnect.command} (${sandboxConnect.status})`
                : "No sandbox for this conversation"
            }
            onClick={() => {
              if (sandboxConnect) {
                void copySandboxCommand(sandboxConnect.command);
              }
            }}
          />
          <Button
            label="Self-improving skills"
            variant="primary"
            size="xs"
            onClick={() => void copyTestCase()}
            disabled={isTestCaseLoading}
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
        </div>
        {showRenderControls && (
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  label={
                    selectedAgentId
                      ? `Agent: ${
                          agents.find((a) => a.sId === selectedAgentId)?.name ??
                          selectedAgentId
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
                    onClick={() =>
                      setAgentSelection({
                        agentId: a.sId,
                        conversationId,
                      })
                    }
                  >
                    {a.name} ({a.sId})
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Input
              aria-label="Context size override"
              placeholder="Context size override"
              value={contextSizeOverride}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setContextSizeOverride(e.target.value)
              }
              className="h-7 w-44"
            />
            {isRendering && <Spinner size="xs" />}
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
                  label={`Model: ${renderResult.modelIdUsed}`}
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
                      JSON.stringify(renderResult.modelConversation, null, 2)
                    )
                  }
                />
                <Button
                  label="Close"
                  variant="outline"
                  size="xs"
                  icon={XClose}
                  onClick={() => {
                    clearRenderResult();
                  }}
                />
              </div>
              <div className="rounded-md border border-separator p-3">
                <Collapsible defaultOpen={false}>
                  <CollapsibleTrigger>
                    <h3 className="text-sm font-medium text-foreground">
                      System prompt
                    </h3>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2">
                      <CodeBlock
                        wrapLongLines
                        className="language-text max-h-96 overflow-y-auto"
                      >
                        {renderResult.systemPrompt}
                      </CodeBlock>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
              <div className="rounded-md border border-separator p-3">
                <Collapsible defaultOpen={true}>
                  <CollapsibleTrigger>
                    <h3 className="text-sm font-medium text-foreground">
                      Model conversation
                    </h3>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2">
                      <CodeBlock wrapLongLines className="language-json">
                        {JSON.stringify(
                          renderResult.modelConversation,
                          null,
                          2
                        )}
                      </CodeBlock>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
