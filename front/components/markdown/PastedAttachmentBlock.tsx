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
      if (node.name === "pasted_attachment" && node.children[0]) {
        const data = node.data || (node.data = {});
        data.hName = "pasted_attachment";
        data.hProperties = {
          title: node.children[0].value,
        };
      }
    });
  };
}
