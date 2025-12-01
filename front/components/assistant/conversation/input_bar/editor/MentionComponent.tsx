import { NodeViewWrapper } from "@tiptap/react";
import React from "react";

import { MentionDisplay } from "@app/lib/mentions/ui/MentionDisplay";
import type { WorkspaceType } from "@app/types";

interface MentionComponentProps {
  node: {
    attrs: {
      type: "agent" | "user";
      id: string;
      label: string;
      description?: string;
      pictureUrl?: string;
    };
  };
  owner: WorkspaceType;
}

export const MentionComponent = ({ node, owner }: MentionComponentProps) => {
  const { id, label, description, pictureUrl, type } = node.attrs;

  return (
    <NodeViewWrapper className="inline-flex">
      <MentionDisplay
        mention={{
          id,
          label,
          description: description ?? "",
          pictureUrl: pictureUrl ?? "",
          type,
        }}
        interactive={!!owner}
        owner={owner}
        showTooltip={true}
      />
    </NodeViewWrapper>
  );
};
