import { AttachmentChip } from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { visit } from "unist-util-visit";

export interface AttachmentChipDirectiveBlockProps {
  label: string;
  icon: string | null;
  getIcon: (icon: string | null) => ComponentType<{ className?: string }>;
  onClick?: () => void;
}

export function AttachmentChipDirectiveBlock({
  label,
  icon,
  getIcon,
  onClick,
}: AttachmentChipDirectiveBlockProps) {
  return (
    <AttachmentChip
      label={label}
      icon={{ visual: getIcon(icon), size: "xs" }}
      onClick={onClick}
      color="primary"
      size="xs"
    />
  );
}

interface CreateAttachmentChipDirectiveOptions {
  directiveName: string;
  hName: string;
  getHProperties: (node: any) => Record<string, unknown>;
}

export function createAttachmentChipDirective({
  directiveName,
  hName,
  getHProperties,
}: CreateAttachmentChipDirectiveOptions) {
  return function directive() {
    return (tree: any) => {
      visit(tree, ["textDirective"], (node) => {
        if (node.name === directiveName && node.children[0]) {
          const data = node.data ?? {};
          // `unist-util-visit` directive transforms are expected to annotate the
          // current node in place so mdast-util-to-hast can consume `node.data`.
          node.data = data;
          data.hName = hName;
          data.hProperties = getHProperties(node);
        }
      });
    };
  };
}
