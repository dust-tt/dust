import {
  ChatBubbleBottomCenterTextIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EyeIcon,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";
import { useRouter } from "next/router";
import React from "react";

import { useURLSheet } from "@app/hooks/useURLSheet";
import { getAgentRoute, setQueryParam } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types";

interface MentionComponentProps {
  node: {
    attrs: {
      id: string;
      label: string;
      description?: string;
    };
  };
  owner?: WorkspaceType;
}

export const MentionComponent = ({ node, owner }: MentionComponentProps) => {
  const router = useRouter();
  const { onOpenChange: onOpenChangeAssistantModal } =
    useURLSheet("agentDetails");

  const { id: agentSId, label: agentName, description } = node.attrs;

  const handleStartConversation = async () => {
    if (!owner) {
      return;
    }
    await router.push(getAgentRoute(owner.sId, "new", `agent=${agentSId}`));
  };

  const handleSeeDetails = () => {
    onOpenChangeAssistantModal(true);
    setQueryParam(router, "agentDetails", agentSId);
  };

  const trigger = (
    <DropdownMenuTrigger asChild>
      <span className="inline-block cursor-pointer font-medium text-highlight-500">
        @{agentName}
      </span>
    </DropdownMenuTrigger>
  );

  return (
    <NodeViewWrapper className="inline-flex">
      <TooltipProvider>
        <DropdownMenu>
          <TooltipRoot>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            {description && <TooltipContent>{description}</TooltipContent>}
          </TooltipRoot>
          <DropdownMenuContent side="top" align="start">
            <DropdownMenuItem
              onClick={handleStartConversation}
              icon={ChatBubbleBottomCenterTextIcon}
              label={`New conversation with @${agentName}`}
            />
            <DropdownMenuItem
              onClick={handleSeeDetails}
              icon={EyeIcon}
              label={`About @${agentName}`}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipProvider>
    </NodeViewWrapper>
  );
};
