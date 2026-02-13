/** biome-ignore-all lint/nursery/noImportCycles: I'm too lazy to fix that now */

import { Button, ICON_SIZE_MAP } from "@sparkle/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sparkle/components/Dropdown";
import { Icon } from "@sparkle/components/Icon";
import { ChevronRightIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib";
import { cva } from "class-variance-authority";
import type { ComponentType } from "react";
import React from "react";

const DEFAULT_LABEL_TRUNCATE_LENGTH_MIDDLE = 15;
const DEFAULT_LABEL_TRUNCATE_LENGTH_END = 30;
const ELLIPSIS_STRING = "...";

const breadcrumbTextVariants = cva("", {
  variants: {
    isLast: {
      true: "s-text-foreground dark:s-text-foreground-night",
      false: "s-text-muted-foreground dark:s-text-muted-foreground-night",
    },
    size: {
      xs: "",
      sm: "",
    },
    hasLighterFont: {
      true: "",
      false: "",
    },
  },
  compoundVariants: [
    { size: "xs", hasLighterFont: true, className: "s-text-xs" },
    { size: "sm", hasLighterFont: true, className: "s-text-sm" },
    { size: "xs", hasLighterFont: false, className: "s-label-xs" },
    { size: "sm", hasLighterFont: false, className: "s-label-sm" },
  ],
  defaultVariants: {
    size: "sm",
    hasLighterFont: true,
    isLast: false,
  },
});

type BaseBreadcrumbItem = {
  icon?: ComponentType<{ className?: string }>;
  label: string;
};

type LinkBreadcrumbItem = BaseBreadcrumbItem & {
  href: string;
  onClick?: never;
};

type ButtonBreadcrumbItem = BaseBreadcrumbItem & {
  href?: never;
  onClick: () => void;
};

type LabelBreadcrumbItem = BaseBreadcrumbItem & {
  href?: never;
  onClick?: never;
};

export type BreadcrumbItem =
  | LinkBreadcrumbItem
  | ButtonBreadcrumbItem
  | LabelBreadcrumbItem;

const isLinkItem = (
  item: BreadcrumbItem | { label: string }
): item is LinkBreadcrumbItem =>
  "href" in item && typeof item.href === "string";

const isButtonItem = (
  item: BreadcrumbItem | { label: string }
): item is ButtonBreadcrumbItem =>
  "onClick" in item && typeof item.onClick === "function";

interface BreadcrumbItemProps {
  item: BreadcrumbItem;
  isLast: boolean;
  itemsHidden?: BreadcrumbItem[];
  size?: "xs" | "sm";
  hasLighterFont?: boolean;
  truncateLengthMiddle?: number;
  truncateLengthEnd?: number;
}

function BreadcrumbItem({
  item,
  isLast,
  itemsHidden,
  size = "sm",
  hasLighterFont = true,
  truncateLengthMiddle = DEFAULT_LABEL_TRUNCATE_LENGTH_MIDDLE,
  truncateLengthEnd = DEFAULT_LABEL_TRUNCATE_LENGTH_END,
}: BreadcrumbItemProps) {
  if (item.label === ELLIPSIS_STRING) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            label={ELLIPSIS_STRING}
            icon={item.icon}
            size={size}
            hasLighterFont={hasLighterFont}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            {itemsHidden?.map((item, index) => (
              <DropdownMenuItem
                key={`breadcrumbs-hidden-${index}`}
                href={isLinkItem(item) ? item.href : undefined}
                onClick={isButtonItem(item) ? item.onClick : undefined}
                icon={item.icon}
                label={item.label}
              />
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const textClassName = breadcrumbTextVariants({
    isLast,
    size,
    hasLighterFont,
  });

  const truncatedLabel = truncateTextToLength(
    item.label,
    isLast ? truncateLengthEnd : truncateLengthMiddle
  );

  const isLabelTruncated = truncatedLabel !== item.label;

  if (isLinkItem(item)) {
    return (
      <Button
        href={item.href}
        icon={item.icon}
        variant={isLast ? "ghost" : "ghost-secondary"}
        label={truncatedLabel}
        tooltip={isLabelTruncated ? item.label : undefined}
        size={size}
        hasLighterFont={hasLighterFont}
      />
    );
  }

  if (isButtonItem(item)) {
    return (
      <Button
        onClick={item.onClick}
        icon={item.icon}
        variant={isLast ? "ghost" : "ghost-secondary"}
        label={truncatedLabel}
        tooltip={isLabelTruncated ? item.label : undefined}
        size={size}
        hasLighterFont={hasLighterFont}
      />
    );
  }

  if (item.icon) {
    return (
      <div className="s-shrink0 s-label-sm s-inline-flex s-h-9 s-items-center s-gap-2 s-border s-border-border/0 s-px-3">
        <Icon
          visual={item.icon}
          size={ICON_SIZE_MAP[size]}
          className={cn("-s-mx-0.5")}
        />
        <div className={textClassName}>{item.label}</div>
      </div>
    );
  }

  return (
    <div className={cn("s-px-2 s-py-1.5", textClassName)}>{item.label}</div>
  );
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
  size?: "xs" | "sm";
  hasLighterFont?: boolean;
  truncateLengthMiddle?: number;
  truncateLengthEnd?: number;
}

interface BreadcrumbsAccumulator {
  itemsShown: BreadcrumbItem[];
  itemsHidden: BreadcrumbItem[];
}

export function Breadcrumbs({
  items,
  className,
  size = "sm",
  hasLighterFont = true,
  truncateLengthMiddle,
  truncateLengthEnd,
}: BreadcrumbProps) {
  const { itemsShown, itemsHidden } = items.reduce(
    (acc: BreadcrumbsAccumulator, item, index) => {
      if (items.length <= 5 || index < 2 || index >= items.length - 2) {
        acc.itemsShown.push(item);
      } else if (index === 2) {
        acc.itemsShown.push({ label: ELLIPSIS_STRING });
        acc.itemsHidden.push(item);
      } else {
        acc.itemsHidden.push(item);
      }
      return acc;
    },
    { itemsShown: [], itemsHidden: [] }
  );

  return (
    <div className={cn("s-flex s-flex-row s-items-center s-gap-0", className)}>
      {itemsShown.map((item, index) => {
        return (
          <div
            key={`breadcrumbs-${index}`}
            className="s-flex s-flex-row s-items-center s-gap-0"
          >
            <BreadcrumbItem
              item={item}
              isLast={index === itemsShown.length - 1}
              itemsHidden={itemsHidden}
              size={size}
              hasLighterFont={hasLighterFont}
              truncateLengthMiddle={truncateLengthMiddle}
              truncateLengthEnd={truncateLengthEnd}
            />
            {index === itemsShown.length - 1 ? null : (
              <Icon
                visual={ChevronRightIcon}
                className="s-text-faint"
                size={size === "xs" ? "xs" : "sm"}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function truncateTextToLength(text: string, length: number) {
  return text.length > length
    ? `${text.substring(0, length - 1)}${ELLIPSIS_STRING}`
    : text;
}
