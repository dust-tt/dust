/**
 * Display component for mentions.
 *
 * This component provides a consistent visual representation of mentions
 * across the application. It can be used in both interactive (with dropdown)
 * and non-interactive modes.
 */

import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@dust-tt/sparkle";
import React from "react";

import type { WorkspaceType } from "@app/types";
import type { RichMention } from "@app/types";

import { MentionDropdown } from "./MentionDropdown";

interface MentionDisplayProps {
  mention: RichMention;
  interactive?: boolean;
  owner?: WorkspaceType;
  showTooltip?: boolean;
}

interface MentionTriggerProps {
  mention: RichMention;
}

function MentionTrigger({ mention }: MentionTriggerProps) {
  return (
    <span className="inline-block cursor-pointer font-medium text-highlight-500">
      @{mention.label}
    </span>
  );
}

/**
 * Displays a mention as a styled badge with optional tooltip and dropdown.
 *
 * When interactive=true and owner is provided, clicking the mention will
 * show a dropdown menu with actions. When showTooltip=true and description
 * is available, hovering will show a tooltip.
 */
export function MentionDisplay({
  mention,
  interactive = false,
  owner,
  showTooltip = true,
}: MentionDisplayProps) {
  // If interactive and owner is provided, wrap with dropdown.
  if (interactive && owner) {
    // If tooltip is requested and description exists, wrap with tooltip.
    if (showTooltip && mention.description) {
      return (
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger asChild>
              <MentionDropdown mention={mention} owner={owner}>
                <MentionTrigger mention={mention} />
              </MentionDropdown>
            </TooltipTrigger>
            <TooltipContent>{mention.description}</TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      );
    }

    return (
      <MentionDropdown mention={mention} owner={owner}>
        <MentionTrigger mention={mention} />
      </MentionDropdown>
    );
  }

  // Non-interactive display, optionally with tooltip.
  if (showTooltip && mention.description) {
    return (
      <TooltipProvider>
        <TooltipRoot>
          <TooltipTrigger asChild>
            <MentionTrigger mention={mention} />
          </TooltipTrigger>
          <TooltipContent>{mention.description}</TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
    );
  }

  return <MentionTrigger mention={mention} />;
}

/*
=======
  const router = useRouter();
  const { onOpenChange: onOpenChangeAgentModal } = useURLSheet("agentDetails");

  const { id, label, description, type: mentionType } = node.attrs;

  const handleAgentStartConversation = async () => {
    if (!owner) {
      return;
    }
    await router.push(getConversationRoute(owner.sId, "new", `agent=${id}`));
  };

  const handleAgentSeeDetails = () => {
    onOpenChangeAgentModal(true);
    setQueryParam(router, "agentDetails", id);
  };

  const handleViewMembers = async () => {
    if (!owner) {
      return;
    }
    await router.push(`/w/${owner.sId}/members`);
  };

  const trigger = (
    <DropdownMenuTrigger asChild>
      <span className="inline-block cursor-pointer font-medium text-highlight-500">
        @{label}
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
            {mentionType === "agent" ? (
              <>
                <DropdownMenuItem
                  onClick={handleAgentStartConversation}
                  icon={ChatBubbleBottomCenterTextIcon}
                  label={`New conversation with @${label}`}
                />
                <DropdownMenuItem
                  onClick={handleAgentSeeDetails}
                  icon={EyeIcon}
                  label={`About @${label}`}
                />
              </>
            ) : (
              <>
                <DropdownMenuItem
                  onClick={handleViewMembers}
                  icon={EyeIcon}
                  label={`View members`}
                />
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipProvider>

 */
