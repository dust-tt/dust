/**
 * Shared dropdown component for mention interactions.
 *
 * This component provides a consistent dropdown menu for mentions across
 * the application, including actions like starting a new conversation or
 * viewing agent details.
 */

import {
  ChatBubbleBottomCenterTextIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EyeIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React from "react";

import { useURLSheet } from "@app/hooks/useURLSheet";
import { getConversationRoute, setQueryParam } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types";

import type { RichMention } from "../types";

interface MentionDropdownProps {
  mention: RichMention;
  owner: WorkspaceType;
  children: React.ReactNode;
}

/**
 * Dropdown menu component for agent mentions.
 * Provides actions to start a new conversation or view agent details.
 */
export function MentionDropdown({
  mention,
  owner,
  children,
}: MentionDropdownProps) {
  const router = useRouter();
  const { onOpenChange: onOpenChangeAgentModal } = useURLSheet("agentDetails");

  // Only support agent mentions for now.
  if (mention.type !== "agent") {
    return <>{children}</>;
  }

  const handleStartConversation = async () => {
    await router.push(
      getConversationRoute(owner.sId, "new", `agent=${mention.id}`)
    );
  };

  const handleSeeDetails = () => {
    onOpenChangeAgentModal(true);
    setQueryParam(router, "agentDetails", mention.id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start">
        <DropdownMenuItem
          onClick={handleStartConversation}
          icon={ChatBubbleBottomCenterTextIcon}
          label={`New conversation with @${mention.label}`}
        />
        <DropdownMenuItem
          onClick={handleSeeDetails}
          icon={EyeIcon}
          label={`About @${mention.label}`}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
