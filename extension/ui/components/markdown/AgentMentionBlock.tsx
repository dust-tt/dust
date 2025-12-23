import { InputBarContext } from "@app/ui/components/input_bar/InputBarContext";
import { classNames } from "@dust-tt/sparkle";
import { useContext } from "react";
import { visit } from "unist-util-visit";

export function AgentMentionBlock({
  agentName,
  agentSId,
}: {
  agentName: string;
  agentSId: string;
}) {
  const { setAnimate, setSelectedAgent } = useContext(InputBarContext);

  return (
    <span
      className={classNames(
        "text-highlight inline-block cursor-pointer font-medium",
        "dark:text-highlight-night"
      )}
      onClick={() => {
        setSelectedAgent({ configurationId: agentSId });
        setAnimate(true);
      }}
    >
      @{agentName}
    </span>
  );
}

export function agentMentionDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      // Warning: we can't rename easily `mention` to agent_mention, because the messages DB contains this name
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
