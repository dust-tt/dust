import React from "react";

import { cn } from "@sparkle/lib/utils";

import { Chip, CHIP_COLORS, CHIP_SIZES } from "./Chip";
import { DoubleIcon, DoubleIconProps, Icon, IconProps } from "./Icon";
import { LinkWrapperProps } from "./LinkWrapper";

const attachmentChipOverrides = cn(
  "s-rounded-lg s-px-2 s-py-1 s-heading-sm s-gap-1.5",
  "s-bg-background s-text-foreground s-max-w-44",
  "dark:s-bg-background-night dark:s-text-foreground-night"
);

type AttachmentChipIconProps = IconProps | DoubleIconProps;

function isDoubleIconProps(
  props: AttachmentChipIconProps
): props is DoubleIconProps {
  return "mainIcon" in props;
}

interface AttachmentChipBaseProps {
  label: string;
  icon?: AttachmentChipIconProps;
  size?: (typeof CHIP_SIZES)[number];
  color?: (typeof CHIP_COLORS)[number];
  className?: string;
  isBusy?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
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
  icon,
  className,
  label,
  size,
  color,
  isBusy,
  onRemove,
  onClick,
  ...linkProps
}: AttachmentChipProps) {
  const iconElement = icon && (
    <div className="s-shrink-0">
      {isDoubleIconProps(icon) ? <DoubleIcon {...icon} /> : <Icon {...icon} />}
    </div>
  );

  const chipClassName = cn(attachmentChipOverrides, className);

  if ("href" in linkProps && linkProps.href) {
    return (
      <Chip
        className={chipClassName}
        label={label}
        size={size}
        color={color}
        isBusy={isBusy}
        onRemove={onRemove}
        {...linkProps}
      >
        {iconElement}
      </Chip>
    );
  }

  return (
    <Chip
      className={chipClassName}
      label={label}
      size={size}
      color={color}
      isBusy={isBusy}
      onRemove={onRemove}
      onClick={onClick}
    >
      {iconElement}
    </Chip>
  );
}
