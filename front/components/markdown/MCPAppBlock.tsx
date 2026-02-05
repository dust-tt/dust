import type { ComponentType } from "react";
import React from "react";
import type { ReactMarkdownProps } from "react-markdown/lib/complex-types";
import { visit } from "unist-util-visit";

import { MCPAppIframe } from "@app/components/assistant/conversation/actions/MCPAppIframe";
import type { LightWorkspaceType } from "@app/types";

interface MCPAppBlockProps extends ReactMarkdownProps {
  sessionId?: string;
}

function isMCPAppProps(props: ReactMarkdownProps): props is MCPAppBlockProps {
  return Object.prototype.hasOwnProperty.call(props, "sessionId");
}

interface MCPAppBlockComponentProps {
  owner: LightWorkspaceType;
  conversationId: string;
}

/**
 * Creates the MCPAppBlock component with the necessary context.
 */
export function getMCPAppPlugin(
  owner: LightWorkspaceType,
  conversationId: string
): ComponentType<ReactMarkdownProps> {
  return function MCPAppBlock(props: ReactMarkdownProps) {
    if (!isMCPAppProps(props) || !props.sessionId) {
      // If no sessionId, just render nothing
      return null;
    }

    return (
      <MCPAppIframe
        owner={owner}
        conversationId={conversationId}
        sessionId={props.sessionId}
      />
    );
  };
}

/**
 * Markdown directive parser for :mcp_app{sessionId=xxx}
 * Transforms the directive into a custom element that can be rendered by MCPAppBlock.
 */
export function mcpAppDirective() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "mcp_app") {
        const attributes = node.attributes as
          | Record<string, string>
          | undefined;
        const sessionId = attributes?.sessionId;

        if (sessionId) {
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          const data = node.data || (node.data = {});

          // Map to a custom HTML element that will be rendered by MCPAppBlock
          data.hName = "mcp_app";
          data.hProperties = {
            sessionId,
          };
        }
      }
    });
  };
}
