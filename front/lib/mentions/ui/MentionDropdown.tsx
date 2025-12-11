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
export const MentionDropdown = React.forwardRef<
  HTMLDivElement,
  MentionDropdownProps
>(({ mention, owner, children }, ref) => {
  const router = useRouter();
  const { onOpenChange: onOpenChangeAgentModal } = useURLSheet("agentDetails");
  const { onOpenChange: onOpenChangeUserModal } = useURLSheet("userDetails");

  // Agent mention actions.
  if (isRichAgentMention(mention)) {
    const handleAgentStartConversation = async () => {
      await router.push(
        getConversationRoute(owner.sId, "new", `agent=${mention.id}`)
      );
    };

    const handleAgentSeeDetails = () => {
      onOpenChangeAgentModal(true);
      setQueryParam(router, "agentDetails", mention.id);
    };

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div ref={ref}>{children}</div>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start">
          <DropdownMenuItem
            onClick={handleAgentStartConversation}
            icon={ChatBubbleBottomCenterTextIcon}
            label={`New conversation with @${mention.label}`}
          />
          <DropdownMenuItem
            onClick={handleAgentSeeDetails}
            icon={EyeIcon}
            label={`About @${mention.label}`}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const handleUserSeeDetails = () => {
    onOpenChangeUserModal(true);
    setQueryParam(router, "userDetails", mention.id);
  };

  return (
    <div
      onClick={isRichUserMention(mention) ? handleUserSeeDetails : undefined}
      ref={ref}
    >
      {children}
    </div>
  );
});

MentionDropdown.displayName = "MentionDropdown";
