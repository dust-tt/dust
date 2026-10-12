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
import React, { useLayoutEffect, useRef, useState } from "react";

const DEFAULT_LABEL_TRUNCATE_LENGTH_MIDDLE = 15;
const DEFAULT_LABEL_TRUNCATE_LENGTH_END = 30;
const ELLIPSIS_STRING = "...";
// The trail folds from the left, but never the root: it is the only drop target
// for moving an item back to the top level (the folder tree has no row for it).
const PINNED_HEAD_COUNT = 1;

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
  isPulsing?: boolean;
  isDropHighlight?: boolean;
  onDragOver?: React.DragEventHandler<HTMLElement>;
  onDragLeave?: React.DragEventHandler<HTMLElement>;
  onDrop?: React.DragEventHandler<HTMLElement>;
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

  const dropClassName = item.isDropHighlight
    ? "bg-muted-background"
    : undefined;

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
        isPulsing={item.isPulsing}
        className={dropClassName}
        onDragOver={item.onDragOver}
        onDragLeave={item.onDragLeave}
        onDrop={item.onDrop}
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
        isPulsing={item.isPulsing}
        className={dropClassName}
        onDragOver={item.onDragOver}
        onDragLeave={item.onDragLeave}
        onDrop={item.onDrop}
      />
    );
  }

  if (item.icon) {
    return (
      <div className="label-sm inline-flex h-9 min-w-0 items-center gap-2 border border-transparent px-3">
        <Icon
          visual={item.icon}
          size={ICON_SIZE_MAP[size]}
          className={cn("-mx-0.5 shrink-0")}
        />
        <div className={cn(isLast && "truncate", textClassName)}>
          {item.label}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("px-2 py-1.5", isLast && "min-w-0 truncate", textClassName)}
    >
      {item.label}
    </div>
  );
}

/** One segment plus its trailing chevron; only the last one may shrink. */
function BreadcrumbSegment({
  isLast,
  size,
  ...props
}: BreadcrumbItemRendererProps) {
  return (
    <div
      className={cn(
        "flex flex-row items-center gap-0",
        isLast ? "min-w-0 shrink" : "shrink-0"
      )}
    >
      <BreadcrumbItemRenderer isLast={isLast} size={size} {...props} />
      {isLast ? null : (
        <Icon
          visual={ChevronRight}
          className="shrink-0 text-faint"
          size={size === "xs" ? "xs" : "sm"}
        />
      )}
    </div>
  );
}

interface BreadcrumbProps {
  items: BreadcrumbsItem[];
  className?: string;
  size?: "xs" | "sm";
  buttonVariant?: ButtonVariantType;
  hasLighterFont?: boolean;
  truncateLengthMiddle?: number;
  truncateLengthEnd?: number;
}

/**
 * How many segments after the root still fit, measured on a hidden copy of the
 * full trail: reading the rendered one would feed its own collapsed width back
 * into the next measurement. Needs a container with a width of its own — give
 * it `flex-1` rather than letting it size to its content.
 */
function useVisibleTailCount(
  items: BreadcrumbsItem[],
  containerRef: React.RefObject<HTMLDivElement | null>,
  measureRef: React.RefObject<HTMLDivElement | null>
) {
  const tailLength = Math.max(items.length - PINNED_HEAD_COUNT, 0);
  const [visibleTailCount, setVisibleTailCount] = useState(tailLength);
  const trailKey = items.map((item) => item.label).join("\u0000");

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) {
      return;
    }

    const recompute = () => {
      const [ellipsisWidth, ...widths] = Array.from(measure.children).map(
        (child) => child.getBoundingClientRect().width
      );
      const headWidth = widths
        .slice(0, PINNED_HEAD_COUNT)
        .reduce((total, width) => total + width, 0);
      const tailWidths = widths.slice(PINNED_HEAD_COUNT);
      const available = container.clientWidth;

      if (
        headWidth + tailWidths.reduce((total, width) => total + width, 0) <=
        available
      ) {
        setVisibleTailCount(tailWidths.length);
        return;
      }

      let used = headWidth + ellipsisWidth;
      let shown = 0;
      for (let index = tailWidths.length - 1; index >= 0; index--) {
        used += tailWidths[index];
        if (used > available && shown > 0) {
          break;
        }
        shown++;
      }
      setVisibleTailCount(shown);
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, measureRef, trailKey]);

  return Math.min(visibleTailCount, tailLength);
}

export function Breadcrumbs({
  items,
  className,
  size = "sm",
  buttonVariant = "ghost",
  hasLighterFont = true,
  truncateLengthMiddle,
  truncateLengthEnd,
}: BreadcrumbProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const visibleTailCount = useVisibleTailCount(items, containerRef, measureRef);

  const tail = items.slice(PINNED_HEAD_COUNT);
  const itemsHidden = tail.slice(0, tail.length - visibleTailCount);
  const itemsShown: BreadcrumbsItem[] = [
    ...items.slice(0, PINNED_HEAD_COUNT),
    ...(itemsHidden.length > 0 ? [{ label: ELLIPSIS_STRING }] : []),
    ...tail.slice(tail.length - visibleTailCount),
  ];

  const sharedProps = {
    size,
    buttonVariant,
    hasLighterFont,
    truncateLengthMiddle,
    truncateLengthEnd,
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex min-w-0 flex-row items-center gap-0",
        className
      )}
    >
      {itemsShown.map((item, index) => (
        <BreadcrumbSegment
          key={`breadcrumbs-${index}`}
          item={item}
          isLast={index === itemsShown.length - 1}
          itemsHidden={itemsHidden}
          {...sharedProps}
        />
      ))}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex w-max flex-row items-center gap-0"
      >
        <BreadcrumbSegment
          item={{ label: ELLIPSIS_STRING }}
          isLast={false}
          {...sharedProps}
        />
        {items.map((item, index) => (
          <BreadcrumbSegment
            key={`breadcrumbs-measure-${index}`}
            item={item}
            isLast={index === items.length - 1}
            {...sharedProps}
          />
        ))}
      </div>
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
