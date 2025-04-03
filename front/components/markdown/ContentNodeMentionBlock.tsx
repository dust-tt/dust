import { AttachmentChip } from "@dust-tt/sparkle";
import { visit } from "unist-util-visit";

export function ContentNodeMentionBlock({ title }: { title: string }) {
  return <AttachmentChip label={title} />;
}

export function contentNodeMentionDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "content_node_mention" && node.children[0]) {
        const data = node.data || (node.data = {});
        data.hName = "content_node_mention";
        data.hProperties = {
          title: node.children[0].value,
          url: node.attributes.url,
        };
      }
    });
  };
}
