import { Chip } from "@dust-tt/sparkle";
import { visit } from "unist-util-visit";

export function UrlMentionBlock({ title }: { title: string; url: string }) {
  return <Chip label={title} size="xs" color="white" />;
}

export function urlMentionDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "url_mention" && node.children[0]) {
        const data = node.data || (node.data = {});
        data.hName = "url_mention";
        data.hProperties = {
          title: node.children[0].value,
          url: node.attributes.url,
        };
      }
    });
  };
}
