import {
  RenderResult,
  type RenderTarget,
} from "@app/components/poke/conversation_render/RenderResult";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokeConversation, usePokeLLMTrace } from "@app/poke/swr";
import { usePokeAgentConfigurations } from "@app/poke/swr/agent_configurations";
import { usePokeConversationConfig } from "@app/poke/swr/conversation_config";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import type { PostRenderConversationResponseBody } from "@app/types/api/poke/conversation_render";
import type { ConversationType } from "@app/types/assistant/conversation";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import type { PokeAgentMessageType } from "@app/types/poke";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  LinkExternal01,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

const PREVIEW_TARGET_KEY = "preview";

function getRenderTargets(
  content: ConversationType | null | undefined
): RenderTarget[] {
  if (!content) {
    return [];
  }

  return content.content
    .flat()
    .filter((message): message is PokeAgentMessageType =>
      isAgentMessageType(message)
    )
    .map((message) => {
      const maxContentStep = message.contents.reduce(
        (maxStep, item) => Math.max(maxStep, item.step),
        0
      );
      const maxStep = Math.max(
        maxContentStep,
        (message.runUrls?.filter((run) => run.isLLM).length ?? 1) - 1
      );

      return {
        key: `${message.sId}:${message.version}`,
        label: `${message.configuration.name} · ${new Date(message.created).toLocaleString()} · v${message.version}`,
        message,
        steps: Array.from({ length: maxStep + 1 }, (_, step) => step),
      };
    })
    .reverse();
}

export function ConversationRenderPage() {
  const owner = useWorkspace();
  const conversationId = useRequiredPathParam("cId");
  const { conversation } = usePokeConversation({
    workspaceId: owner.sId,
    conversationId,
  });
  const { data: conversationConfig } = usePokeConversationConfig({
    owner,
    conversationId,
  });
  const { data: agents } = usePokeAgentConfigurations({
    owner,
    agentsGetView: "admin_internal",
  });

  usePokePageMetadata({
    name: conversation?.title,
    subtitle: "Render diagnostics",
    sId: conversationId,
  });

  const targets = getRenderTargets(conversation);
  const targetsByKey = new Map(targets.map((target) => [target.key, target]));
  const defaultTargetKey = targets[0]?.key ?? PREVIEW_TARGET_KEY;
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(
    null
  );
  const effectiveTargetKey = selectedTargetKey ?? defaultTargetKey;
  const selectedTarget = targetsByKey.get(effectiveTargetKey);

  const defaultPreviewAgentId =
    selectedTarget?.message.configuration.sId ?? agents[0]?.sId ?? "";
  const [selectedPreviewAgentId, setSelectedPreviewAgentId] = useState<
    string | null
  >(null);
  const effectivePreviewAgentId =
    selectedPreviewAgentId ?? defaultPreviewAgentId;

  const defaultStep = selectedTarget?.steps.at(-1) ?? 0;
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const effectiveStep = selectedStep ?? String(defaultStep);
  const selectedLLMRuns =
    selectedTarget?.message.runUrls?.filter((run) => run.isLLM) ?? [];
  const selectedRecordedRunId =
    selectedLLMRuns[Number(effectiveStep)]?.runId ??
    selectedLLMRuns.at(-1)?.runId ??
    null;
  const { langfuseError, langfuseTrace } = usePokeLLMTrace({
    workspace: owner,
    runId: selectedRecordedRunId,
    disabled: selectedRecordedRunId === null,
  });
  const [contextSizeOverride, setContextSizeOverride] = useState("");
  const [excludeActions, setExcludeActions] = useState(false);
  const [excludeImages, setExcludeImages] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderResult, setRenderResult] =
    useState<PostRenderConversationResponseBody | null>(null);

  async function handleRenderConversation() {
    if (!selectedTarget && !effectivePreviewAgentId) {
      setRenderError("Select an agent or historical agent message first.");
      return;
    }

    setIsRendering(true);
    setRenderError(null);
    try {
      const response = await clientFetch(
        `/api/poke/workspaces/${owner.sId}/conversations/${conversationId}/render`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(selectedTarget
              ? {
                  agentMessageId: selectedTarget.message.sId,
                  agentMessageVersion: selectedTarget.message.version,
                  step: Number(effectiveStep),
                }
              : { agentId: effectivePreviewAgentId }),
            contextSizeOverride: contextSizeOverride
              ? Number(contextSizeOverride)
              : null,
            excludeActions,
            excludeImages,
          }),
        }
      );
      const data: PostRenderConversationResponseBody & {
        error?: { message?: string };
      } = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message ?? "Failed to render conversation");
      }
      setRenderResult(data);
    } catch (error) {
      setRenderError(
        error instanceof Error ? error.message : "Unknown rendering error"
      );
    } finally {
      setIsRendering(false);
    }
  }

  if (!conversation) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const targetLabel = selectedTarget?.label ?? "Live preview";
  const previewAgentLabel =
    agents.find((agent) => agent.sId === effectivePreviewAgentId)?.name ??
    effectivePreviewAgentId;

  return (
    <div className="w-full max-w-7xl pb-12">
      <Page.Vertical align="stretch">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <a
                href={`/poke/${owner.sId}/conversation/${conversationId}`}
                className="text-highlight hover:underline"
              >
                Conversation
              </a>
              <span aria-hidden="true">/</span>
              <span>Render diagnostics</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Model context diagnostics
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Reconstruct one model step through the production render path and
              inspect every token-bearing part of the input.
            </p>
          </div>
          {conversationConfig?.langfuseUiBaseUrl && (
            <Button
              href={`${conversationConfig.langfuseUiBaseUrl}/traces?filter=metadata%3BstringObject%3BconversationId%3B%3D%3B${conversationId}`}
              label="Conversation in Langfuse"
              variant="outline"
              size="sm"
              target="_blank"
              icon={LinkExternal01}
            />
          )}
        </header>

        <section className="rounded-xl border border-separator bg-muted-background p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)_minmax(12rem,1fr)]">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Reconstruction target
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="Choose reconstruction target"
                    label={targetLabel}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="max-h-96 w-[32rem] max-w-[90vw] overflow-y-auto"
                >
                  {targets.map((target) => (
                    <DropdownMenuItem
                      key={target.key}
                      onClick={() => {
                        setSelectedTargetKey(target.key);
                        setSelectedStep(null);
                        setRenderResult(null);
                      }}
                    >
                      {target.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedTargetKey(PREVIEW_TARGET_KEY);
                      setSelectedStep(null);
                      setRenderResult(null);
                    }}
                  >
                    Live preview with current agent configuration
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {selectedTarget ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Model step
                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label="Choose model step"
                      label={`Step ${effectiveStep}`}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {selectedTarget.steps.map((step) => (
                      <DropdownMenuItem
                        key={step}
                        onClick={() => {
                          setSelectedStep(String(step));
                          setRenderResult(null);
                        }}
                      >
                        Step {step}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Preview agent
                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label="Choose preview agent"
                      label={previewAgentLabel || "Select agent"}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {agents.map((agent) => (
                      <DropdownMenuItem
                        key={agent.sId}
                        onClick={() => {
                          setSelectedPreviewAgentId(agent.sId);
                          setRenderResult(null);
                        }}
                      >
                        {agent.name} ({agent.sId})
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            <div>
              <label
                htmlFor="context-size-override"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Context size override
              </label>
              <Input
                id="context-size-override"
                inputMode="numeric"
                min={1}
                type="number"
                placeholder="Use model default"
                value={contextSizeOverride}
                onChange={(event) => {
                  setContextSizeOverride(event.target.value);
                  setRenderResult(null);
                }}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-separator pt-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={excludeActions}
                  onCheckedChange={(checked) => {
                    setExcludeActions(checked === true);
                    setRenderResult(null);
                  }}
                />
                Exclude tool calls and results
              </label>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={excludeImages}
                  onCheckedChange={(checked) => {
                    setExcludeImages(checked === true);
                    setRenderResult(null);
                  }}
                />
                Exclude images
              </label>
            </div>
            <div className="flex items-center gap-3">
              {isRendering && <Spinner size="sm" />}
              <Button
                label={
                  renderResult ? "Re-render diagnostics" : "Render diagnostics"
                }
                variant="primary"
                size="sm"
                disabled={isRendering}
                onClick={() => void handleRenderConversation()}
              />
            </div>
          </div>
        </section>

        {renderError && (
          <div
            role="alert"
            className="rounded-xl border border-warning-300 bg-warning-50 p-4 text-sm text-warning-900"
          >
            <div className="font-semibold">Rendering failed</div>
            <div className="mt-1">{renderError}</div>
          </div>
        )}

        {renderResult && (
          <RenderResult
            result={renderResult}
            target={selectedTarget}
            langfuseError={langfuseError}
            langfuseTrace={langfuseTrace}
            langfuseUiBaseUrl={conversationConfig?.langfuseUiBaseUrl ?? null}
            workspaceId={owner.sId}
          />
        )}
      </Page.Vertical>
    </div>
  );
}
