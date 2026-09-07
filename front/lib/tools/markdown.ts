import { parseToolTag, TOOL_TAG_REGEX } from "@app/lib/tools/format";
import { escapeXml } from "@app/types/shared/utils/string_utils";
import { visit } from "unist-util-visit";

export interface ToolDirectiveProps {
  toolId: string;
  toolIcon: string | null;
  toolName: string;
}

export function toolDirective(this: {
  parse: (content: string) => { type: string; children?: unknown };
}) {
  const processor = this;
  return (tree: any) => {
    visit(tree, ["html", "textDirective"], (node, index, parent) => {
      if (node.type === "html" && parseToolTag(node.value)) {
        // A tag on its own line can start an HTML block that also contains the
        // following message text. Reparse it as Markdown so that text is retained.
        const markdown = node.value.replace(TOOL_TAG_REGEX, (tag: string) => {
          const tool = parseToolTag(tag);
          if (!tool) {
            return tag;
          }
          return `:tool[]{id="${escapeXml(tool.id)}" name="${escapeXml(tool.name)}" icon="${escapeXml(tool.icon ?? "")}"}`;
        });
        const parsed = processor.parse(markdown);
        if (!Array.isArray(parsed.children)) {
          return;
        }
        const firstNode = parsed.children[0];
        const nodes =
          parent.type === "paragraph" && firstNode?.type === "paragraph"
            ? firstNode.children
            : parsed.children;
        // Remark transforms replace nodes in their parent in place.
        parent.children.splice(index, 1, ...nodes);
        return index;
      }

      if (node.type === "textDirective" && node.name === "tool") {
        node.data = {
          hName: "tool",
          hProperties: {
            toolId: node.attributes.id,
            toolIcon: node.attributes.icon,
            toolName: node.attributes.name,
          },
        };
      }
    });
  };
}
