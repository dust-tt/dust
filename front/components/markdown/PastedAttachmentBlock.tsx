import { AttachmentChip } from "@dust-tt/sparkle";
import { PaperclipIcon } from "lucide-react";
import React from "react";
import { visit } from "unist-util-visit";

export function PastedAttachmentBlock({ title }: { title: string }) {
  return <AttachmentChip label={title} icon={PaperclipIcon} />;
}

export function pastedAttachmentDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      // Support both old "pasted_attachment" and new "pasted_content" for backward compatibility
      if (
        (node.name === "pasted_content" || node.name === "pasted_attachment") &&
        node.children[0]
      ) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const data = node.data || (node.data = {});
        data.hName = "pasted_attachment";
        data.hProperties = {
          title: node.children[0].value,
        };
      }
    });
  };
}
