import {
  Avatar,
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
import { useAgentConfiguration } from "@app/lib/swr/assistants";
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

  const { agentConfiguration } = useAgentConfiguration({
    workspaceId: owner?.sId ?? "",
    agentConfigurationId: agentSId,
    disabled: !owner || !agentSId,
  });
  const pictureUrl = agentConfiguration?.pictureUrl;

  const handleStartConversation = async () => {
    if (!owner) {
      return;
    }
    await router.push(`/w/${owner.sId}/assistant/new?assistant=${agentSId}`);
  };

  const handleSeeDetails = () => {
    onOpenChangeAssistantModal(true);
    setQueryParam(router, "assistantDetails", agentSId);
  };

  return (
    <NodeViewWrapper className="inline-flex align-middle">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-white px-2 py-1 align-middle leading-none dark:border-border-night dark:bg-black">
            <Avatar size="xs" visual={pictureUrl} />
            <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
              {agentName}
            </span>
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
