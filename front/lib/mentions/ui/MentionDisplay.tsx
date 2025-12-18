/**
 * Display component for mentions.
 *
 * This component provides a consistent visual representation of mentions
 * across the application. It can be used in both interactive (with dropdown)
 * and non-interactive modes.
 */

import {
  cn,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@dust-tt/sparkle";
import React from "react";

import { useUser } from "@app/lib/swr/user";
import type { WorkspaceType } from "@app/types";
import type { RichMention } from "@app/types";

import { MentionDropdown } from "./MentionDropdown";

interface MentionDisplayProps {
  mention: RichMention;
  interactive?: boolean;
  owner: WorkspaceType;
  showTooltip?: boolean;
}

interface MentionTriggerProps {
  mention: RichMention;
  isCurrentUserMentioned: boolean;
}

function MentionTrigger({
  mention,
  isCurrentUserMentioned = false,
}: MentionTriggerProps) {
  return (
    <span
      className={cn(
        "inline-block cursor-pointer font-light text-highlight-500 dark:text-highlight-500-night",
        isCurrentUserMentioned && "bg-golden-100 dark:bg-golden-100-night"
      )}
    >
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
  const { user } = useUser();
  const isCurrentUserMentioned = mention.id === user?.sId;
  // If interactive and owner is provided, wrap with dropdown.
  if (interactive && owner) {
    // If tooltip is requested and description exists, wrap with tooltip.
    if (showTooltip && mention.description) {
      return (
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger asChild>
              <MentionDropdown mention={mention} owner={owner}>
                <MentionTrigger
                  mention={mention}
                  isCurrentUserMentioned={isCurrentUserMentioned}
                />
              </MentionDropdown>
            </TooltipTrigger>
            <TooltipContent>{mention.description}</TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      );
    }

    return (
      <div className="inline-flex">
        <MentionDropdown mention={mention} owner={owner}>
          <MentionTrigger
            mention={mention}
            isCurrentUserMentioned={isCurrentUserMentioned}
          />
        </MentionDropdown>
      </div>
    );
  }

  // Non-interactive display, optionally with tooltip.
  if (showTooltip && mention.description) {
    return (
      <TooltipProvider>
        <TooltipRoot>
          <TooltipTrigger asChild>
            <MentionTrigger
              mention={mention}
              isCurrentUserMentioned={isCurrentUserMentioned}
            />
          </TooltipTrigger>
          <TooltipContent>{mention.description}</TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
    );
  }

  return (
    <MentionTrigger
      mention={mention}
      isCurrentUserMentioned={isCurrentUserMentioned}
    />
  );
}
