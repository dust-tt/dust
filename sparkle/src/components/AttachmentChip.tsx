import { cn } from "@sparkle/lib/utils";
import React from "react";

import { type CHIP_COLORS, type CHIP_SIZES, Chip } from "./Chip";
import { DoubleIcon, type DoubleIconProps, Icon, type IconProps } from "./Icon";
import type { LinkWrapperProps } from "./LinkWrapper";

const attachmentChipOverrides = cn(
  "rounded-lg px-2 py-1 heading-sm gap-1.5",
  "bg-background text-foreground max-w-44",
  "align-middle"
);

export type AttachmentChipIconProps = IconProps;
export type AttachmentChipDoubleIconProps = DoubleIconProps;

type AttachmentChipIconOptions =
  | { icon?: AttachmentChipIconProps; doubleIcon?: never }
  | { icon?: never; doubleIcon?: AttachmentChipDoubleIconProps };

export type AttachmentChipBaseProps = AttachmentChipIconOptions & {
  /** Attachment name (typically the file name); long labels truncate. */
  label: string;
  size?: (typeof CHIP_SIZES)[number];
  /** Semantic color of the underlying Chip. */
  color?: (typeof CHIP_COLORS)[number];
  className?: string;
  /** Show the breathing animation while the attachment is processing. */
  isBusy?: boolean;
  /** Invoked when the remove affordance is clicked; its presence shows it. */
  onRemove?: () => void;
  children?: never;
};

export type AttachmentChipButtonProps = AttachmentChipBaseProps & {
  href?: never;
  onClick?: () => void;
};

export type AttachmentChipLinkProps = AttachmentChipBaseProps &
  Omit<LinkWrapperProps, "children" | "href"> & {
    href: string;
    onClick?: never;
  };

export type AttachmentChipProps =
  | AttachmentChipButtonProps
  | AttachmentChipLinkProps;

/**
 * A compact, inline chip representing a file, document, or folder attached to a
 * conversation message, with a truncated label and a single `icon` or a `doubleIcon`
 * (main icon overlaid with a connector logo). Use it to reference attached documents
 * or connected resources within a chat message; for richer source references with
 * descriptions or images, use Citation instead.
 * @summary Inline attachment chip.
 */
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
    <div className="shrink-0">
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
