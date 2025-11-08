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
  UserIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React from "react";

import { useURLSheet } from "@app/hooks/useURLSheet";
import { getConversationRoute, setQueryParam } from "@app/lib/utils/router";
import type { RichMention, WorkspaceType } from "@app/types";
import { isRichAgentMention, isRichUserMention } from "@app/types";

interface MentionDropdownProps {
  mention: RichMention;
  owner: WorkspaceType;
  children: React.ReactNode;
}

/**
 * Dropdown menu component for mentions.
 * Provides actions based on the mention type:
 * - Agent mentions: start a conversation or view details
 * - User mentions: view user profile
 */
export function MentionDropdown({
  mention,
  owner,
  children,
}: MentionDropdownProps) {
  const router = useRouter();
  const { onOpenChange: onOpenChangeAgentModal } = useURLSheet("agentDetails");

  // Agent mention actions.
  if (isRichAgentMention(mention)) {
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

  // User mention actions.
  if (isRichUserMention(mention)) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start">
          <DropdownMenuItem
            icon={UserIcon}
            label={`Profile of @${mention.label}: ${mention.description || ""}`}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Unsupported mention type, render children without dropdown.
  return <>{children}</>;
}
