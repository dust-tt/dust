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

export type AttachmentChipIconProps = IconProps;
export type AttachmentChipDoubleIconProps = DoubleIconProps;

type AttachmentChipIconOptions =
  | { icon?: AttachmentChipIconProps; doubleIcon?: never }
  | { icon?: never; doubleIcon?: AttachmentChipDoubleIconProps };

export type AttachmentChipBaseProps = AttachmentChipIconOptions & {
  label: string;
  size?: (typeof CHIP_SIZES)[number];
  color?: (typeof CHIP_COLORS)[number];
  className?: string;
  isBusy?: boolean;
  onRemove?: () => void;
  children?: never;
};

export type AttachmentChipButtonProps = AttachmentChipBaseProps & {
  href?: never;
  onClick?: () => void;
} & {
  [K in keyof Omit<LinkWrapperProps, "children">]?: never;
};

export type AttachmentChipLinkProps = AttachmentChipBaseProps &
  Omit<LinkWrapperProps, "children" | "href"> & {
    href: string;
    onClick?: never;
  };

export type AttachmentChipProps =
  | AttachmentChipButtonProps
  | AttachmentChipLinkProps;

export function AttachmentChip({
  icon,
  doubleIcon,
  className,
  label,
  size,
  color,
  isBusy,
  onRemove,
  onClick,
  ...linkProps
}: AttachmentChipProps) {
  const chipClassName = cn(attachmentChipOverrides, className);
  const iconElement = (icon || doubleIcon) && (
    <div className="s-shrink-0">
      {doubleIcon ? <DoubleIcon {...doubleIcon} /> : <Icon {...icon} />}
    </div>
  );

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
