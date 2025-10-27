/**
 * Markdown directive plugin for mentions.
 *
 * This module provides remark-directive plugins for parsing and rendering
 * mentions in markdown content, enabling the :mention[name]{sId=xxx} syntax.
 */

import { visit } from "unist-util-visit";

import type { WorkspaceType } from "@app/types";

import { MentionDisplay } from "../ui/MentionDisplay";

/**
 * Remark directive plugin for parsing mention directives.
 *
 * Transforms `:mention[name]{sId=xxx}` into a custom HTML element
 * that can be rendered by the mention component.
 *
 * Note: We cannot easily rename "mention" to "agent_mention" because
 * the messages stored in the database use this name.
 */
export function agentMentionDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "mention" && node.children[0]) {
        const data = node.data || (node.data = {});
        data.hName = "mention";
        data.hProperties = {
          agentSId: node.attributes.sId,
          agentName: node.children[0].value,
        };
      }
    });
  };
}

/**
 * Creates a React component plugin for rendering mentions in markdown.
 *
 * This function returns a component that can be used as a custom component
 * in ReactMarkdown to render the mention HTML elements.
 *
 * @param owner - The workspace context for mention interactions
 * @returns A React component for rendering mentions
 */
export function getAgentMentionPlugin(owner: WorkspaceType) {
  const AgentMentionPlugin = ({
    agentName,
    agentSId,
  }: {
    agentName: string;
    agentSId: string;
  }) => {
    return (
      <MentionDisplay
        mention={{
          id: agentSId,
          label: agentName,
          type: "agent",
          pictureUrl: "",
          description: "",
        }}
        interactive
        owner={owner}
        showTooltip={false}
      />
    );
  };

  return AgentMentionPlugin;
}
