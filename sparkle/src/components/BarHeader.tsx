import React from "react";

import {
  ArrowUpOnSquare,
  ChevronLeft,
  Trash,
  XMark,
} from "@sparkle/icons/solid";

import { Button } from "./Button";

interface BarHeaderProps {
  title: string;
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
}

export function BarHeader({
  title,
  leftActions,
  rightActions,
}: BarHeaderProps) {
  const titleClasses =
    "s-text-base s-font-bold s-truncate s-text-element-800 s-grow";
  const buttonBarClasses = "s-flex s-gap-1";

  return (
    <div className="s-fixed s-left-0 s-right-0 s-top-0 s-z-30 s-flex s-h-16 s-flex-row s-items-center s-gap-3 s-border-b s-border-structure-300/30 s-bg-white/90 s-px-4 s-backdrop-blur-xl">
      {leftActions && <div className={buttonBarClasses}>{leftActions}</div>}
      <div className={titleClasses}>{title}</div>
      {rightActions && <div className={buttonBarClasses}>{rightActions}</div>}
    </div>
  );
}

interface ListItemProps {
  variant: "close" | "back" | "validate" | "conversation";
}

BarHeader.ButtonBar = function ({ variant }: ListItemProps) {
  switch (variant) {
    case "back":
      return (
        <Button
          size="sm"
          icon={ChevronLeft}
          variant="tertiary"
          label="Back"
          tooltipPosition="below"
          labelVisible={false}
        />
      );
    case "close":
      return (
        <Button
          size="sm"
          icon={XMark}
          variant="tertiary"
          label="Close"
          tooltipPosition="below"
          labelVisible={false}
        />
      );
    case "validate":
      return (
        <>
          <Button size="sm" label="Cancel" variant="secondaryWarning" />
          <Button size="sm" label="Save" variant="primary" />
        </>
      );
    case "conversation":
      return (
        <>
          <Button
            size="sm"
            label="Delete"
            icon={Trash}
            variant="secondaryWarning"
            labelVisible={false}
            tooltipPosition="below"
          />
          <Button
            size="sm"
            label="Share"
            icon={ArrowUpOnSquare}
            variant="secondary"
          />
        </>
      );
    default:
      return null;
  }
};
