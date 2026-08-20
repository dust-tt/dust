import {
  Button,
  type ButtonVariantType,
  ICON_SIZE_MAP,
  type RegularButtonSize,
} from "@sparkle/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sparkle/components/Dropdown";
import { Icon } from "@sparkle/components/Icon";
import { ChevronRight } from "@sparkle/icons/v2-stroke";
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
      true: "text-foreground",
      false: "text-muted-foreground",
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
    { size: "xs", hasLighterFont: true, className: "text-xs" },
    { size: "sm", hasLighterFont: true, className: "text-sm" },
    { size: "xs", hasLighterFont: false, className: "label-xs" },
    { size: "sm", hasLighterFont: false, className: "label-sm" },
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

export type BreadcrumbsItem =
  | LinkBreadcrumbItem
  | ButtonBreadcrumbItem
  | LabelBreadcrumbItem;

const isLinkItem = (
  item: BreadcrumbsItem | { label: string }
): item is LinkBreadcrumbItem =>
  "href" in item && typeof item.href === "string";

const isButtonItem = (
  item: BreadcrumbsItem | { label: string }
): item is ButtonBreadcrumbItem =>
  "onClick" in item && typeof item.onClick === "function";

interface BreadcrumbItemRendererProps {
  item: BreadcrumbsItem;
  isLast: boolean;
  itemsHidden?: BreadcrumbsItem[];
  size?: "xs" | "sm";
  buttonVariant?: ButtonVariantType;
  hasLighterFont?: boolean;
  truncateLengthMiddle?: number;
  truncateLengthEnd?: number;
}

function BreadcrumbItemRenderer({
  item,
  isLast,
  itemsHidden,
  size = "sm",
  buttonVariant = "ghost",
  hasLighterFont = true,
  truncateLengthMiddle = DEFAULT_LABEL_TRUNCATE_LENGTH_MIDDLE,
  truncateLengthEnd = DEFAULT_LABEL_TRUNCATE_LENGTH_END,
}: BreadcrumbItemRendererProps) {
  if (item.label === ELLIPSIS_STRING) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={buttonVariant}
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
        variant={buttonVariant ?? (isLast ? "ghost" : "ghost-secondary")}
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
        variant={buttonVariant ?? (isLast ? "ghost" : "ghost-secondary")}
        label={truncatedLabel}
        tooltip={isLabelTruncated ? item.label : undefined}
        size={size}
        hasLighterFont={hasLighterFont}
      />
    );
  }

  if (item.icon) {
    return (
      <div className="shrink0 label-sm inline-flex h-9 items-center gap-2 border border-transparent px-3">
        <Icon
          visual={item.icon}
          size={ICON_SIZE_MAP[size]}
          className={cn("-mx-0.5")}
        />
        <div className={textClassName}>{item.label}</div>
      </div>
    );
  }

  return <div className={cn("px-2 py-1.5", textClassName)}>{item.label}</div>;
}

interface BreadcrumbProps {
  /** Trail segments; each has a `label` and optional `icon`, `href`, or `onClick`. */
  items: BreadcrumbsItem[];
  className?: string;
  size?: "xs" | "sm";
  /** Button variant used for clickable segments (default `ghost`). */
  buttonVariant?: ButtonVariantType;
  /** Use the lighter text style instead of label styling (default true). */
  hasLighterFont?: boolean;
  /** Max characters for intermediate labels before truncation (default 15). */
  truncateLengthMiddle?: number;
  /** Max characters for the last label before truncation (default 30). */
  truncateLengthEnd?: number;
}

interface BreadcrumbsAccumulator {
  itemsShown: BreadcrumbsItem[];
  itemsHidden: BreadcrumbsItem[];
}

/**
 * Displays the user's location within a hierarchy as a trail of clickable segments,
 * driven by an `items` array. Long trails automatically collapse middle segments
 * into an ellipsis menu and truncate overflowing labels. Use it to show and navigate
 * the path to the current page; for switching between sibling views rather than
 * levels of depth, use Tabs instead.
 * @summary Hierarchical navigation trail.
 */
export function Breadcrumbs({
  items,
  className,
  size = "sm",
  buttonVariant = "ghost",
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
    <div className={cn("flex flex-row items-center gap-0", className)}>
      {itemsShown.map((item, index) => {
        return (
          <div
            key={`breadcrumbs-${index}`}
            className="flex flex-row items-center gap-0"
          >
            <BreadcrumbItemRenderer
              item={item}
              isLast={index === itemsShown.length - 1}
              itemsHidden={itemsHidden}
              size={size}
              buttonVariant={buttonVariant}
              hasLighterFont={hasLighterFont}
              truncateLengthMiddle={truncateLengthMiddle}
              truncateLengthEnd={truncateLengthEnd}
            />
            {index === itemsShown.length - 1 ? null : (
              <Icon
                visual={ChevronRight}
                className="text-faint"
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

// Composable breadcrumb primitives.

interface BreadcrumbRootProps {
  children: React.ReactNode;
  className?: string;
}

/** Composable breadcrumb root: a nav landmark wrapping BreadcrumbItem children. */
export function Breadcrumb({ children, className }: BreadcrumbRootProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex flex-row items-center gap-0", className)}
    >
      {children}
    </nav>
  );
}

interface BreadcrumbItemProps {
  children: React.ReactNode;
  className?: string;
}

/** Composable wrapper for one breadcrumb segment inside a Breadcrumb. */
export function BreadcrumbItem({ children, className }: BreadcrumbItemProps) {
  return (
    <div className={cn("flex flex-row items-center", className)}>
      {children}
    </div>
  );
}

interface BreadcrumbButtonProps {
  label: string;
  onClick?: () => void;
  variant?: ButtonVariantType;
  size?: RegularButtonSize;
  icon?: ComponentType<{ className?: string }>;
}

/** Clickable breadcrumb segment rendered as a Button. */
export function BreadcrumbButton({
  label,
  onClick,
  variant = "ghost",
  size = "sm",
  icon,
}: BreadcrumbButtonProps) {
  return (
    <Button
      label={label}
      onClick={onClick}
      variant={variant}
      size={size}
      icon={icon}
      hasLighterFont
    />
  );
}

interface BreadcrumbPageProps {
  children: React.ReactNode;
  className?: string;
}

/** Non-interactive current-page segment (`aria-current="page"`). */
export function BreadcrumbPage({ children, className }: BreadcrumbPageProps) {
  return (
    <span
      aria-current="page"
      className={cn(
        "inline-flex h-9 items-center px-3",
        breadcrumbTextVariants({
          isLast: true,
          size: "sm",
          hasLighterFont: true,
        }),
        className
      )}
    >
      {children}
    </span>
  );
}

/** Chevron separator between breadcrumb segments. */
export function BreadcrumbSeparator({ className }: { className?: string }) {
  return (
    <Icon
      aria-hidden="true"
      visual={ChevronRight}
      className={cn("text-faint", className)}
      size="sm"
    />
  );
}
