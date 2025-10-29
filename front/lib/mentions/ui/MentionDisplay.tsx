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
  const trigger = (
    <span className="inline-block cursor-pointer font-medium text-highlight-500">
      @{mention.label}
    </span>
  );

  // If interactive and owner is provided, wrap with dropdown.
  if (interactive && owner) {
    // If tooltip is requested and description exists, wrap with tooltip.
    if (showTooltip && mention.description) {
      return (
        <TooltipProvider>
          <MentionDropdown mention={mention} owner={owner}>
            <TooltipRoot>
              <TooltipTrigger asChild>{trigger}</TooltipTrigger>
              <TooltipContent>{mention.description}</TooltipContent>
            </TooltipRoot>
          </MentionDropdown>
        </TooltipProvider>
      );
    }

    return (
      <MentionDropdown mention={mention} owner={owner}>
        {trigger}
      </MentionDropdown>
    );
  }

  // Non-interactive display, optionally with tooltip.
  if (showTooltip && mention.description) {
    return (
      <TooltipProvider>
        <TooltipRoot>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent>{mention.description}</TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
    );
  }

  return trigger;
}
