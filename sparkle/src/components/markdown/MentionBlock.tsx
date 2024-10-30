import React from "react";
import { visit } from "unist-util-visit";

export function MentionBlock({ agentName }: { agentName: string }) {
  return (
    <span className="s-inline-block s-cursor-default s-font-medium s-text-brand">
      @{agentName}
    </span>
  );
}

export function mentionDirective() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
