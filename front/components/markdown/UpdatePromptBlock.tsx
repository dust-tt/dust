/**
 * Markdown directive plugin for updatePrompt.
 *
 * This module provides remark-directive plugins for parsing and rendering
 * updatePrompt directives in markdown content, enabling the
 * :updatePrompt[Suggestion name]{diff="...", fullPrompt="...", agentId="..."} syntax.
 */

import {
  Button,
  CheckIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PencilSquareIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React, { useCallback, useState } from "react";
import { visit } from "unist-util-visit";

import { useSendNotification } from "@app/hooks/useNotification";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { clientFetch } from "@app/lib/egress/client";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import type { LightWorkspaceType } from "@app/types";

/**
 * Converts escaped newline characters (\n) to actual newlines.
 * This is needed because the directive attributes are parsed as literal strings.
 */
function unescapeNewlines(content: string): string {
  return content.replace(/\\n/g, "\n");
}

/**
 * Reverses the preprocessInstructionBlocks transformation.
 * Converts :::instruction_block[tagName]\ncontent\n::: back to <tagName>content</tagName>
 */
function restoreInstructionBlocks(content: string): string {
  const DIRECTIVE_REGEX = /:::instruction_block\[(\w+)\]\n([\s\S]*?)\n:::/gi;

  return content.replace(DIRECTIVE_REGEX, (_match, tagName, innerContent) => {
    return `<${tagName}>${innerContent}</${tagName}>`;
  });
}

/**
 * Processes content for display: unescapes newlines and restores instruction blocks.
 */
function processContentForDisplay(content: string): string {
  return restoreInstructionBlocks(unescapeNewlines(content));
}

/**
 * Renders diff content with colored lines.
 * Lines starting with + are green, lines starting with - are red.
 */
function DiffView({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <pre className="whitespace-pre-wrap font-mono text-sm">
      {lines.map((line, index) => {
        let className = "";
        if (line.startsWith("+")) {
          className =
            "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30";
        } else if (line.startsWith("-")) {
          className =
            "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30";
        }

        return (
          <div key={index} className={className}>
            {line}
          </div>
        );
      })}
    </pre>
  );
}

interface UpdatePromptBlockProps {
  suggestionName: string;
  diff: string;
  fullPrompt: string;
  agentId: string;
  owner: LightWorkspaceType;
}

export function UpdatePromptBlock({
  suggestionName,
  diff,
  fullPrompt,
  agentId,
  owner,
}: UpdatePromptBlockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const sendNotification = useSendNotification();

  const {
    agentConfiguration,
    mutateAgentConfiguration,
    isAgentConfigurationLoading,
  } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentId,
  });

  const handleApprove = useCallback(async () => {
    if (!agentConfiguration) {
      sendNotification({
        type: "error",
        title: "Agent not found",
        description: "Could not find the agent configuration to update.",
      });
      return;
    }

    setIsUpdating(true);
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/agent_configurations/${agentId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assistant: {
              name: agentConfiguration.name,
              description: agentConfiguration.description,
              instructions: processContentForDisplay(fullPrompt),
              pictureUrl: agentConfiguration.pictureUrl,
              status: agentConfiguration.status,
              scope: agentConfiguration.scope,
              model: {
                providerId: agentConfiguration.model.providerId,
                modelId: agentConfiguration.model.modelId,
                temperature: agentConfiguration.model.temperature,
                reasoningEffort: agentConfiguration.model.reasoningEffort,
              },
              actions: agentConfiguration.actions
                .filter(isServerSideMCPServerConfiguration)
                .map((action) => ({
                  type: "mcp_server_configuration" as const,
                  mcpServerViewId: action.mcpServerViewId,
                  name: action.name,
                  description: action.description,
                  dataSources: action.dataSources,
                  tables: action.tables,
                  childAgentId: action.childAgentId,
                  timeFrame: action.timeFrame,
                  jsonSchema: action.jsonSchema,
                  additionalConfiguration: action.additionalConfiguration,
                  dustAppConfiguration: action.dustAppConfiguration,
                  secretName: action.secretName,
                })),
              templateId: agentConfiguration.templateId,
              tags: agentConfiguration.tags.map((tag) => ({
                sId: tag.sId,
                name: tag.name,
                kind: tag.kind,
              })),
              editors:
                agentConfiguration.editors?.map((editor) => ({
                  sId: editor.sId,
                })) ?? [],
            },
          }),
        }
      );

      if (res.ok) {
        await mutateAgentConfiguration();
        sendNotification({
          type: "success",
          title: "Prompt updated",
          description: `Successfully updated the instructions for ${agentConfiguration.name}.`,
        });
        setIsOpen(false);
      } else {
        const errorData = await res.json();
        sendNotification({
          type: "error",
          title: "Failed to update prompt",
          description: errorData.error?.message ?? "An unknown error occurred.",
        });
      }
    } catch {
      sendNotification({
        type: "error",
        title: "Failed to update prompt",
        description: "An unexpected error occurred while updating the prompt.",
      });
    } finally {
      setIsUpdating(false);
    }
  }, [
    agentConfiguration,
    agentId,
    fullPrompt,
    mutateAgentConfiguration,
    owner.sId,
    sendNotification,
  ]);

  if (isRejected) {
    return (
      <div className="my-2 rounded-lg border border-border bg-muted-background/50 p-3 opacity-60">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <XMarkIcon className="h-4 w-4" />
          <span>Suggestion rejected: {suggestionName}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="my-2 rounded-lg border border-border bg-muted-background p-4">
        <div className="mb-3 flex items-center gap-2">
          <PencilSquareIcon className="text-action-500 h-4 w-4" />
          <span className="font-semibold">{suggestionName}</span>
          {agentConfiguration && (
            <span className="text-sm text-muted-foreground">
              for{" "}
              <a
                href={`/w/${owner.sId}/builder/assistants/${agentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-action-500 hover:text-action-400 hover:underline"
              >
                @{agentConfiguration.name}
              </a>
            </span>
          )}
        </div>
        <div className="mb-3 max-h-32 overflow-y-auto rounded border border-border bg-background p-2">
          <DiffView content={processContentForDisplay(diff)} />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={XMarkIcon}
            label="Reject"
            onClick={() => setIsRejected(true)}
          />
          <Button
            size="sm"
            variant="primary"
            icon={CheckIcon}
            label={isAgentConfigurationLoading ? "Loading..." : "Approve"}
            onClick={() => setIsOpen(true)}
            disabled={isAgentConfigurationLoading}
          />
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Update Agent Prompt</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="mb-2 font-semibold">Suggested Changes</h3>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted-background p-3">
                  <DiffView content={processContentForDisplay(diff)} />
                </div>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Full Updated Prompt</h3>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted-background p-3">
                  <pre className="whitespace-pre-wrap font-mono text-sm">
                    {processContentForDisplay(fullPrompt)}
                  </pre>
                </div>
              </div>
              {agentConfiguration && (
                <p className="text-sm text-muted-foreground">
                  This will update the instructions for{" "}
                  <a
                    href={`/w/${owner.sId}/builder/assistants/${agentId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-action-500 hover:text-action-400 font-semibold hover:underline"
                  >
                    @{agentConfiguration.name}
                  </a>
                  .
                </p>
              )}
            </div>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
            }}
            rightButtonProps={{
              label: isUpdating ? "Updating..." : "Approve & Update",
              variant: "primary",
              onClick: handleApprove,
              disabled: isUpdating || !agentConfiguration,
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Remark directive plugin for parsing updatePrompt directives.
 *
 * Transforms `:updatePrompt[name]{diff=xxx, fullPrompt=xxx, agentId=xxx}` into a custom HTML element
 * that can be rendered by the UpdatePromptBlock component.
 */
export function updatePromptDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "updatePrompt" && node.children[0]) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const data = node.data || (node.data = {});
        data.hName = "updatePrompt";
        data.hProperties = {
          suggestionName: node.children[0].value,
          diff: node.attributes?.diff ?? "",
          fullPrompt: node.attributes?.fullPrompt ?? "",
          agentId: node.attributes?.agentId ?? "",
        };
      }
    });
  };
}

/**
 * Creates a React component plugin for rendering updatePrompt blocks in markdown.
 *
 * @param owner - The workspace context for agent interactions
 * @returns A React component for rendering update prompt buttons
 */
export function getUpdatePromptPlugin(owner: LightWorkspaceType) {
  const UpdatePromptPlugin = ({
    suggestionName,
    diff,
    fullPrompt,
    agentId,
  }: {
    suggestionName: string;
    diff: string;
    fullPrompt: string;
    agentId: string;
  }) => {
    if (!agentId) {
      return null;
    }
    return (
      <UpdatePromptBlock
        suggestionName={suggestionName}
        diff={diff}
        fullPrompt={fullPrompt}
        agentId={agentId}
        owner={owner}
      />
    );
  };

  return UpdatePromptPlugin;
}
