import type { Node } from "unist";
import { visit } from "unist-util-visit";

// Inline file insert directive. Authors write file references inside markdown
// using a leaf text directive, e.g.:
//
//   :file[DesignNight5_recruiting_enriched.xlsx]{type=xlsx id=enriched-xlsx}
//
// This plugin rewrites those nodes so react-markdown renders them with the
// `file_chip` component (see InlineFileChip's FileChip). It mirrors the
// structure of actionCardDirective, but targets inline `textDirective` nodes.

function getStringAttribute(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getPlainText(node: Node): string {
  const nodeWithValue = node as { value?: unknown };
  if (typeof nodeWithValue.value === "string") {
    return nodeWithValue.value;
  }
  const nodeWithChildren = node as { children?: Node[] };
  if (Array.isArray(nodeWithChildren.children)) {
    return nodeWithChildren.children.map(getPlainText).join("");
  }
  return "";
}

function getLabelFromChildren(node: Node): string {
  const nodeWithChildren = node as { children?: Node[] };
  if (!Array.isArray(nodeWithChildren.children)) {
    return "";
  }
  return nodeWithChildren.children.map(getPlainText).join("").trim();
}

type FileChipData = {
  hName?: string;
  hProperties?: Record<string, unknown>;
};

type FileChipDirectiveNode = Node & {
  type: "textDirective";
  name?: string;
  data?: FileChipData;
  attributes?: Record<string, unknown>;
};

export function fileChipDirective() {
  return (tree: Node) => {
    visit(tree, "textDirective", (node) => {
      const directiveNode = node as FileChipDirectiveNode;
      if (directiveNode.name !== "file") {
        return;
      }

      const attributes = (directiveNode.attributes ?? {}) as Record<
        string,
        unknown
      >;
      const label = getLabelFromChildren(directiveNode);
      const fileType = getStringAttribute(attributes.type);
      const fileId = getStringAttribute(attributes.id);

      const data = directiveNode.data ?? (directiveNode.data = {});
      data.hName = "file_chip";
      data.hProperties = {
        label,
        fileType,
        fileId,
      };
    });
  };
}
