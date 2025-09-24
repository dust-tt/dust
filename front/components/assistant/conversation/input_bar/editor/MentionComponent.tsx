import {
  ChatBubbleBottomCenterTextIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EyeIcon,
} from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";
import { useRouter } from "next/router";
import React from "react";

import { useURLSheet } from "@app/hooks/useURLSheet";
import { setQueryParam } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types";

interface MentionComponentProps {
  node: {
    attrs: {
      id: string;
      label: string;
    };
  };
  owner?: WorkspaceType;
}

export const MentionComponent = ({ node, owner }: MentionComponentProps) => {
  const router = useRouter();
  const { onOpenChange: onOpenChangeAssistantModal } =
    useURLSheet("assistantDetails");

  const { id: agentSId, label: agentName } = node.attrs;

  const handleStartConversation = async () => {
    if (!owner) {
      return;
    }
    await router.push(`/w/${owner.sId}/agent/new?assistant=${agentSId}`);
  };

  const handleSeeDetails = () => {
    onOpenChangeAssistantModal(true);
    setQueryParam(router, "assistantDetails", agentSId);
  };

  return (
    <NodeViewWrapper className="inline-flex">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <span className="inline-block cursor-pointer font-medium text-highlight-500">
            @{agentName}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start">
          <DropdownMenuItem
            onClick={handleStartConversation}
            icon={() => <ChatBubbleBottomCenterTextIcon />}
            label={`New conversation with @${agentName}`}
          />
          <DropdownMenuItem
            onClick={handleSeeDetails}
            icon={() => <EyeIcon />}
            label={`About @${agentName}`}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </NodeViewWrapper>
  );
};
