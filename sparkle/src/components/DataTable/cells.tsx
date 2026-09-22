import { Avatar } from "@sparkle/components/Avatar";
import { Button } from "@sparkle/components/Button";
import { type CHIP_COLORS, Chip } from "@sparkle/components/Chip";
import { Icon } from "@sparkle/components/Icon";
import { IconButton } from "@sparkle/components/IconButton";
import { Tooltip } from "@sparkle/components/Tooltip";
import { useCopyToClipboard } from "@sparkle/hooks";
import {
  ArrowDown,
  ArrowUp,
  Clipboard,
  ClipboardCheck,
  Minus,
} from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import type { Column } from "@tanstack/react-table";
import React, { type ComponentType, type ReactNode } from "react";
import {
  DENSITY_ROW_HEIGHT_CLASS,
  SCROLL_COLUMN_MIN_WIDTH_CLASS,
  useDataTableLayout,
} from "./layout";
import {
  ALIGN_JUSTIFY_CLASS,
  ALIGN_TEXT_CLASS,
  getDataTableColumnPresets,
} from "./presets";

interface CellProps extends React.HTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
  column: Column<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Body cell (td, or th scope="row" with meta.rowHeader) with truncation, density height and column meta styling. */
export function Cell({ children, className, column, ...props }: CellProps) {
  const layout = useDataTableLayout();
  const presets = getDataTableColumnPresets(column);
  const isRowHeader = column.columnDef.meta?.rowHeader === true;
  const Tag = isRowHeader ? "th" : "td";

  return (
    <Tag
      scope={isRowHeader ? "row" : undefined}
      className={cn(
        DENSITY_ROW_HEIGHT_CLASS[layout.density],
        "truncate px-2",
        isRowHeader && "text-left font-normal",
        layout.enforceColumnMinWidth &&
          presets.sortable &&
          SCROLL_COLUMN_MIN_WIDTH_CLASS,
        presets.cellClassName,
        presets.align !== "left" && ALIGN_TEXT_CLASS[presets.align],
        column.columnDef.meta?.className,
        className
      )}
      {...props}
    >
      {presets.align === "left" ? (
        children
      ) : (
        // Cell helpers render flex rows, which ignore text-align; a flex
        // wrapper pushes them along the main axis instead.
        <div
          className={cn(
            "flex items-center",
            ALIGN_JUSTIFY_CLASS[presets.align]
          )}
        >
          {children}
        </div>
      )}
    </Tag>
  );
}

interface CellContentProps extends React.TdHTMLAttributes<HTMLDivElement> {
  avatarUrl?: string;
  avatarTooltipLabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  roundedAvatar?: boolean;
  children?: ReactNode;
  description?: string;
  grow?: boolean;
  disabled?: boolean;
  avatarStack?: {
    items: { name: string; visual?: string | React.ReactNode }[];
    nbVisibleItems?: number;
  };
  /** Second line under the main text. Only rendered at `relaxed` density, where the row has room for it. */
  secondaryLine?: ReactNode;
  /** Content pinned to the end of the cell (a chip, a small button). */
  trailing?: ReactNode;
}

/** Standard cell layout with optional avatar, avatar stack, icon, inline description, secondary line and trailing slot. */
export function CellContent({
  children,
  className,
  avatarUrl,
  avatarTooltipLabel,
  roundedAvatar,
  icon,
  iconClassName,
  description,
  grow = false,
  disabled,
  avatarStack,
  secondaryLine,
  trailing,
  ...props
}: CellContentProps) {
  const { density } = useDataTableLayout();
  const avatarSize = density === "relaxed" ? "sm" : "xs";
  const showSecondaryLine =
    secondaryLine !== undefined && density === "relaxed";

  const primaryLine = (
    <>
      <div
        className={cn(
          grow ? "flex-grow" : "",
          "truncate text-sm",
          "text-foreground"
        )}
      >
        {children}
      </div>
      {description && (
        <span className={cn("pl-2 text-sm", "text-muted-foreground")}>
          {description}
        </span>
      )}
    </>
  );

  return (
    <div
      className={cn(
        "flex items-center",
        grow ? "flex-grow" : "",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      aria-disabled={disabled || undefined}
      {...props}
    >
      {avatarUrl && avatarTooltipLabel && (
        <Tooltip
          trigger={
            <Avatar
              visual={avatarUrl}
              size={avatarSize}
              className="mr-2"
              isRounded={roundedAvatar ?? false}
            />
          }
          label={avatarTooltipLabel}
        />
      )}
      {avatarUrl && !avatarTooltipLabel && (
        <Avatar
          visual={avatarUrl}
          size={avatarSize}
          className="mr-2"
          isRounded={roundedAvatar ?? false}
        />
      )}
      {avatarStack && (
        <Avatar.Stack
          avatars={avatarStack.items}
          nbVisibleItems={avatarStack.nbVisibleItems}
          size={avatarSize}
        />
      )}
      {icon && (
        <Icon
          visual={icon}
          size="sm"
          className={cn("mr-2 text-foreground", iconClassName)}
        />
      )}
      {showSecondaryLine ? (
        <div
          className={cn(
            "flex min-w-0 shrink flex-col truncate",
            grow ? "flex-grow" : ""
          )}
        >
          <div className="flex items-center truncate">{primaryLine}</div>
          <div className="truncate text-xs text-muted-foreground">
            {secondaryLine}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "flex shrink truncate items-center",
            grow ? "flex-grow" : ""
          )}
        >
          {primaryLine}
        </div>
      )}
      {trailing !== undefined && (
        <div className="ml-auto flex shrink-0 items-center pl-2">
          {trailing}
        </div>
      )}
    </div>
  );
}

interface BasicCellContentProps extends React.TdHTMLAttributes<HTMLDivElement> {
  label: string | number;
  tooltip?: string | number;
  textToCopy?: string | number;
  disabled?: boolean;
}

/** Simple muted text cell with an optional tooltip and hover copy-to-clipboard button. */
export function BasicCellContent({
  label,
  tooltip,
  className,
  textToCopy,
  disabled,
  ...props
}: BasicCellContentProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const { density } = useDataTableLayout();
  const cellHeight = DENSITY_ROW_HEIGHT_CLASS[density];

  const handleCopy = async () => {
    const textToUse = textToCopy ?? String(label);
    void copyToClipboard(
      new ClipboardItem({
        "text/plain": new Blob([String(textToUse)], {
          type: "text/plain",
        }),
      })
    );
  };

  return (
    <>
      {tooltip ? (
        <Tooltip
          tooltipTriggerAsChild
          trigger={
            <div
              className={cn(
                cellHeight,
                "group flex items-center gap-2 text-sm",
                "text-muted-foreground",
                disabled && "cursor-not-allowed opacity-50",
                className
              )}
              aria-disabled={disabled || undefined}
              {...props}
            >
              <span className="truncate">{label}</span>
              {textToCopy && (
                <Button
                  icon={isCopied ? ClipboardCheck : Clipboard}
                  className="hidden group-hover:block"
                  variant="outline"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await handleCopy();
                  }}
                  size="xs"
                />
              )}
            </div>
          }
          label={tooltip}
        />
      ) : (
        <div
          className={cn(
            cellHeight,
            "group flex items-center gap-2 text-sm",
            "text-muted-foreground",
            disabled && "cursor-not-allowed opacity-50",
            className
          )}
          aria-disabled={disabled || undefined}
          {...props}
        >
          <span className="truncate">{label}</span>
          {textToCopy && (
            <Button
              icon={isCopied ? ClipboardCheck : Clipboard}
              className="hidden group-hover:block"
              variant="outline"
              onClick={async (e) => {
                e.stopPropagation();
                await handleCopy();
              }}
              size="xs"
            />
          )}
        </div>
      )}
    </>
  );
}

type ChipColorType = (typeof CHIP_COLORS)[number];

interface NumericCellContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The number to display; `null`/`undefined` show `placeholder`. */
  value: number | null | undefined;
  /** BCP 47 locale for digit grouping and decimals. Defaults to the browser locale. */
  locale?: string;
  /** Fixed number of fraction digits. Keep it constant within a column. */
  precision?: number;
  /** Currency symbol or unit, concatenated to the number (e.g. "$" prefix, "%" or " kb" suffix). */
  unit?: string;
  /** Where `unit` goes. Defaults to "suffix". */
  unitPosition?: "prefix" | "suffix";
  /** Shown for missing values. Prefer a word ("Pending") over a dash. */
  placeholder?: string;
  /** Direction arrow shown after the number. Colour follows `upIsPositive`; the arrow always shows. */
  trend?: "up" | "down" | "flat";
  /** Whether an upward trend is good (sales) rather than bad (costs). Defaults to true. */
  upIsPositive?: boolean;
  tooltip?: string;
  disabled?: boolean;
}

function formatNumericValue(
  value: number,
  locale: string | undefined,
  precision: number | undefined
) {
  return value.toLocaleString(
    locale,
    precision === undefined
      ? undefined
      : { minimumFractionDigits: precision, maximumFractionDigits: precision }
  );
}

const TREND_LABEL: Record<
  NonNullable<NumericCellContentProps["trend"]>,
  string
> = {
  up: "Trending up",
  down: "Trending down",
  flat: "No change",
};

/**
 * Right-aligned number in tabular figures, with optional unit and trend arrow.
 * Pair it with a `meta.type: "numeric"` column so the header aligns too.
 */
export function NumericCellContent({
  value,
  locale,
  precision,
  unit,
  unitPosition = "suffix",
  placeholder = "-",
  trend,
  upIsPositive = true,
  tooltip,
  disabled,
  className,
  ...props
}: NumericCellContentProps) {
  const { density } = useDataTableLayout();

  const formatted =
    value === null || value === undefined
      ? placeholder
      : unit === undefined
        ? formatNumericValue(value, locale, precision)
        : unitPosition === "prefix"
          ? `${unit}${formatNumericValue(value, locale, precision)}`
          : `${formatNumericValue(value, locale, precision)}${unit}`;

  const trendIsPositive =
    trend === "up" ? upIsPositive : trend === "down" ? !upIsPositive : null;

  const content = (
    <div
      className={cn(
        DENSITY_ROW_HEIGHT_CLASS[density],
        "flex items-center justify-end gap-1 text-sm tabular-nums whitespace-nowrap",
        "text-foreground",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      aria-disabled={disabled || undefined}
      {...props}
    >
      <span className="truncate">{formatted}</span>
      {trend && (
        <span
          role="img"
          aria-label={TREND_LABEL[trend]}
          className={cn(
            "flex items-center",
            trendIsPositive === true && "text-success-800",
            trendIsPositive === false && "text-warning-800",
            trendIsPositive === null && "text-muted-foreground"
          )}
        >
          <Icon
            visual={
              trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : Minus
            }
            size="xs"
          />
        </span>
      )}
    </div>
  );

  return tooltip ? (
    <Tooltip tooltipTriggerAsChild trigger={content} label={tooltip} />
  ) : (
    content
  );
}

interface StatusCellContentProps {
  /** Short status word, kept in sentence case for screen readers ("Active", "Paused"). */
  label: string;
  /** Chip colour; pair a colour with the label, never rely on colour alone. */
  color?: ChipColorType;
  icon?: ComponentType;
  /** Shimmer for transient states (e.g. "Syncing"). */
  isBusy?: boolean;
  tooltip?: string;
  className?: string;
}

/**
 * Status as a mini Chip so it matches chips elsewhere in the product. Pair it
 * with a `meta.type: "status"` column to keep the label on one line.
 */
export function StatusCellContent({
  label,
  color = "primary",
  icon,
  isBusy,
  tooltip,
  className,
}: StatusCellContentProps) {
  const { density } = useDataTableLayout();

  const content = (
    <div
      className={cn(
        DENSITY_ROW_HEIGHT_CLASS[density],
        "flex items-center",
        className
      )}
    >
      <Chip
        size="mini"
        color={color}
        label={label}
        icon={icon}
        isBusy={isBusy}
      />
    </div>
  );

  return tooltip ? (
    <Tooltip tooltipTriggerAsChild trigger={content} label={tooltip} />
  ) : (
    content
  );
}

interface CellContentWithCopyProps {
  children: React.ReactNode;
  textToCopy?: string;
  className?: string;
}

/** Cell content with a persistent copy-to-clipboard icon button. */
export function CellContentWithCopy({
  children,
  textToCopy,
  className,
}: CellContentWithCopyProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();

  const handleCopy = async () => {
    void copyToClipboard(
      new ClipboardItem({
        "text/plain": new Blob([textToCopy ?? String(children)], {
          type: "text/plain",
        }),
      })
    );
  };

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <span className="truncate">{children}</span>
      <IconButton
        icon={isCopied ? ClipboardCheck : Clipboard}
        variant="outline"
        onClick={async (e) => {
          e.stopPropagation();
          await handleCopy();
        }}
        size="xs"
      />
    </div>
  );
}

/** Table caption element. */
export function Caption({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return (
    <caption className={className} {...props}>
      {children}
    </caption>
  );
}
