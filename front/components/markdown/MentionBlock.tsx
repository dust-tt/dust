import { useContext } from "react";
import { visit } from "unist-util-visit";

import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";

export function MentionBlock({
  agentName,
  agentSId,
}: {
  agentName: string;
  agentSId: string;
}) {
  const { setAnimate, setSelectedAssistant } = useContext(InputBarContext);
  return (
    <span
      className="inline-block cursor-default font-medium text-highlight-500"
      onClick={() => {
        setSelectedAssistant({ configurationId: agentSId });
        setAnimate(true);
      }}
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
