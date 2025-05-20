import { InputBarContext } from "@app/ui/components/input_bar/InputBarContext";
import { classNames } from "@dust-tt/sparkle";
import { useContext } from "react";
import { visit } from "unist-util-visit";

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
      className={classNames(
        "inline-block cursor-pointer font-medium text-highlight",
        "dark:text-highlight-night"
      )}
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
