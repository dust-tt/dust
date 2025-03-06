import { classNames } from "@dust-tt/sparkle";
import { visit } from "unist-util-visit";

export function MentionBlock({ agentName }: { agentName: string }) {
  return (
    <span
      className={classNames(
        "inline-block cursor-default font-medium text-highlight",
        "dark:text-highlight-night"
      )}
    >
      @{agentName}
    </span>
  );
}

export function mentionDirective() {
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
