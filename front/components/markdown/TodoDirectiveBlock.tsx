import { AttachmentChip, ListCheckIcon } from "@dust-tt/sparkle";
import { visit } from "unist-util-visit";

export function TodoDirectiveBlock({
  label,
  sId,
}: {
  label: string;
  sId: string;
}) {
  return (
    <span data-project-todo-sid={sId} className="inline-block">
      <AttachmentChip
        label={label.replaceAll("\n", " ").replaceAll("\r", " ")}
        icon={{ visual: ListCheckIcon }}
        color="green"
      />
    </span>
  );
}

/**
 * Remark plugin: `:todo[label]{sId=…}` → custom element `todo` for react-markdown.
 */
export function todoDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "todo" && node.children[0] && node.attributes?.sId) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const data = node.data || (node.data = {});
        data.hName = "todo";
        data.hProperties = {
          label: node.children[0].value,
          sId: String(node.attributes.sId),
        };
      }
    });
  };
}
