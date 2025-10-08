import { cva } from "class-variance-authority";
import React from "react";

import { cn } from "@sparkle/lib/utils";

import { Button } from "./Button";
import { Icon } from "./Icon";
import { LinkWrapper, LinkWrapperProps } from "./LinkWrapper";

const attachmentChipVariants = cva(
  cn(
    "s-box-border s-inline-flex s-items-center s-gap-1.5 s-rounded-lg s-px-2 s-py-1 s-heading-sm",
    "s-border-border s-bg-background",
    "dark:s-border-border-night dark:s-bg-background-night",
    "s-text-foreground dark:s-text-foreground-night",
    "s-max-w-44"
  )
);

interface AttachmentChipBaseProps {
  label: string;
  icon?: React.ComponentType;
  className?: string;
  actionButton?: {
    label: string;
    onClick: () => void;
    tooltip?: string;
  };
}

type AttachmentChipButtonProps = AttachmentChipBaseProps & {
  href?: never;
} & {
  [K in keyof Omit<LinkWrapperProps, "children">]?: never;
};

type AttachmentChipLinkProps = AttachmentChipBaseProps &
  Omit<LinkWrapperProps, "children">;

type AttachmentChipProps = AttachmentChipButtonProps | AttachmentChipLinkProps;

export function AttachmentChip({
  label,
  icon,
  className,
  actionButton,
  ...props
}: AttachmentChipProps) {
  const chipContent = (
    <div
      className={cn(
        attachmentChipVariants({}),
        className,
        actionButton && "s-max-w-fit"
      )}
    >
      <Icon visual={icon} size="xs" className="s-shrink-0" />
      <span className="s-pointer s-grow s-truncate">{label}</span>
      {actionButton && (
        <Button
          variant="primary"
          size="xs"
          label={actionButton.label}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            actionButton.onClick();
          }}
          tooltip={actionButton.tooltip}
        />
      )}
    </div>
  );

  return "href" in props && props.href ? (
    <LinkWrapper {...props}>{chipContent}</LinkWrapper>
  ) : (
    chipContent
  );
}
