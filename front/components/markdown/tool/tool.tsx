/**
 * Markdown directive plugin for tools.
 *
 * This module provides remark-directive plugins for parsing and rendering
 * tool directives in markdown content, enabling the :tool[name]{sId=xxx} syntax.
 */

import React from "react";
import { visit } from "unist-util-visit";

import { ToolCard } from "@app/components/markdown/tool/ToolCard";
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
      if (node.name === "tool" && node.children[0]) {
        const data = node.data || (node.data = {});
        data.hName = "tool";
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
 * @returns A React component for rendering tool cards
 */
export function getToolPlugin(owner: WorkspaceType) {
  const ToolPlugin = ({
    toolName,
    toolId,
  }: {
    toolName: string;
    toolId: string;
  }) => {
    if (!toolId || !isInternalMCPServerName(toolId)) {
      return null;
    }
    return <ToolCard toolName={toolName} toolId={toolId} owner={owner} />;
  };

  return ToolPlugin;
}
