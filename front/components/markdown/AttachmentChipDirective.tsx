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

export interface AttachmentChipDirectiveProps {
  id: string;
  icon: string | null;
  name: string;
}

export type AttachmentChipDirectiveName = "skill" | "tool";

export function createAttachmentChipDirective(
  directiveName: AttachmentChipDirectiveName
) {
  return function directive() {
    return (tree: any) => {
      visit(tree, ["textDirective"], (node) => {
        if (node.name === directiveName && node.children[0]) {
          const data = node.data ?? {};
          // `unist-util-visit` directive transforms are expected to annotate the
          // current node in place so mdast-util-to-hast can consume `node.data`.
          node.data = data;
          data.hName = directiveName;
          data.hProperties = {
            id: node.attributes.sId,
            icon: node.attributes.icon,
            name: node.children[0].value,
          };
        }
      });
    };
  };
}
