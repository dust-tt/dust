import type { ComponentType } from "react";
import React from "react";

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

const LABEL_TRUNCATE_LENGTH_MIDDLE = 15;
const LABEL_TRUNCATE_LENGTH_END = 30;
const ELLIPSIS_STRING = "...";

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
}

function BreadcrumbItem({
  item,
  isLast,
  itemsHidden,
  size = "sm",
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

  const commonClassName = cn(
    isLast
      ? "s-text-foreground dark:s-text-foreground-night"
      : "s-text-muted-foreground dark:s-text-muted-foreground-night",
    isLast && (size === "xs" ? "s-label-xs" : "s-label-sm")
  );

  const truncatedLabel = truncateTextToLength(
    item.label,
    isLast ? LABEL_TRUNCATE_LENGTH_END : LABEL_TRUNCATE_LENGTH_MIDDLE
  );

  const isLabelTruncated = truncatedLabel !== item.label;

  if (isLinkItem(item)) {
    return (
      <Button
        href={item.href}
        icon={item.icon}
        className={commonClassName}
        variant="ghost"
        label={truncatedLabel}
        tooltip={isLabelTruncated ? item.label : undefined}
        size={size}
      />
    );
  }

  if (isButtonItem(item)) {
    return (
      <Button
        onClick={item.onClick}
        icon={item.icon}
        className={commonClassName}
        variant="ghost"
        label={truncatedLabel}
        tooltip={isLabelTruncated ? item.label : undefined}
        size={size}
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
        <div className={cn("", commonClassName)}>{item.label}</div>
      </div>
    );
  }

  return (
    <div className={cn("s-px-2 s-py-1.5", commonClassName)}>{item.label}</div>
  );
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
  size?: "xs" | "sm";
}

interface BreadcrumbsAccumulator {
  itemsShown: BreadcrumbItem[];
  itemsHidden: BreadcrumbItem[];
}

export function Breadcrumbs({
  items,
  className,
  size = "sm",
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
