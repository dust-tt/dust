/**
 * Markdown directive plugin for tools.
 *
 * This module provides remark-directive plugins for parsing and rendering
 * tool directives in markdown content, enabling the :tool[name]{sId=xxx} syntax.
 */

import React from "react";
import { visit } from "unist-util-visit";

import { ToolSetupCard } from "@app/components/markdown/tool/ToolSetupCard";
import { isInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions/constants";
import type { WorkspaceType } from "@app/types";

/**
 * Remark directive plugin for parsing tool directives.
 *
 * Transforms `:tool[name]{sId=xxx}` into a custom HTML element
 * that can be rendered by the tool button component.
 */
export function toolDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "toolSetup" && node.children[0]) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const data = node.data || (node.data = {});
        data.hName = "toolSetup";
        data.hProperties = {
          toolId: node.attributes.sId,
          toolName: node.children[0].value,
        };
      }
    });
  };
}

/**
 * Creates a React component plugin for rendering tools in markdown.
 *
 * This function returns a component that can be used as a custom component
 * in ReactMarkdown to render the tool HTML elements.
 *
 * @param owner - The workspace context for tool interactions
 * @param conversationId - Optional conversation ID for triggering follow-up messages
 * @param isLastMessage - Whether this is the last message in the conversation
 * @param onSetupComplete - Optional callback when tool setup completes
 * @param onSetupSkipped - Optional callback when tool setup is skipped
 * @returns A React component for rendering tool cards
 */
export function getToolSetupPlugin(
  owner: WorkspaceType,
  conversationId?: string,
  isLastMessage?: boolean,
  onSetupComplete?: (toolId: string) => void,
  onSetupSkipped?: (toolId: string) => void
) {
  const ToolSetupPlugin = ({
    toolName,
    toolId,
  }: {
    toolName: string;
    toolId: string;
  }) => {
    if (!toolId || !isInternalMCPServerName(toolId)) {
      return null;
    }
    return (
      <ToolSetupCard
        toolName={toolName}
        toolId={toolId}
        owner={owner}
        conversationId={conversationId}
        isLastMessage={isLastMessage}
        onSetupComplete={onSetupComplete}
        onSetupSkipped={onSetupSkipped}
      />
    );
  };

  return ToolSetupPlugin;
}
