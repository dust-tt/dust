import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuPortal,
} from "@sparkle/components/Dropdown";
import { Icon } from "@sparkle/components/Icon";
import { Tooltip } from "@sparkle/components/Tooltip";
import { cn } from "@sparkle/lib/utils";
import type { Column } from "@tanstack/react-table";
import React, { type ReactNode, useState } from "react";
import type { TBaseData } from "./DataTable";
import {
  DENSITY_HEADER_HEIGHT_CLASS,
  SCROLL_COLUMN_MIN_WIDTH_CLASS,
  useDataTableLayout,
} from "./layout";
import { renderMenuItem } from "./menu";
import {
  ALIGN_JUSTIFY_CLASS,
  ALIGN_TEXT_CLASS,
  getDataTableColumnPresets,
  getSortIcon,
} from "./presets";

interface DataTableRootProps extends React.HTMLAttributes<HTMLTableElement> {
  children: ReactNode;
  containerClassName?: string;
  containerProps?: React.HTMLAttributes<HTMLDivElement>;
  /** Ref to the container wrapping the table element. */
  containerRef?: React.Ref<HTMLDivElement>;
}

/** The underlying table element with its container-query wrapper. */
export function Root({
  children,
  className,
  containerClassName,
  containerProps,
  containerRef,
  ...props
}: DataTableRootProps) {
  return (
    <div
      ref={containerRef}
      className={cn("@container/table", containerClassName)}
      {...containerProps}
    >
      <table
        className={cn("w-full table-fixed border-collapse", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

interface HeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode;
}

/** Table head section (thead). */
export function Header({ children, className, ...props }: HeaderProps) {
  return (
    <thead className={cn(className)} {...props}>
      {children}
    </thead>
  );
}

interface HeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode;
  column: Column<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  /**
   * Makes the header a sort toggle: children render inside a full-width button
   * with the sort icon, and the cell exposes `aria-sort`. Prefer this over
   * `onClick` on the cell so keyboard users can sort.
   */
  onSort?: React.MouseEventHandler<HTMLButtonElement>;
}

/** Header cell (th) with alignment, optional tooltip, and optional sort button from the column meta. */
export function Head({
  children,
  className,
  column,
  onSort,
  ...props
}: HeadProps) {
  const layout = useDataTableLayout();
  const presets = getDataTableColumnPresets(column);
  const sorted = column.getIsSorted();

  const content = onSort ? (
    <button
      type="button"
      onClick={onSort}
      className={cn(
        "heading-sm flex w-full cursor-pointer items-center gap-1 whitespace-nowrap rounded-xs capitalize text-foreground",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        "active:scale-[0.985] motion-reduce:active:scale-100",
        ALIGN_JUSTIFY_CLASS[presets.headerAlign]
      )}
    >
      {children}
      <Icon visual={getSortIcon(sorted)} size="xs" />
    </button>
  ) : (
    children
  );

  return (
    <th
      scope="col"
      aria-sort={
        onSort
          ? sorted === "asc"
            ? "ascending"
            : sorted === "desc"
              ? "descending"
              : "none"
          : undefined
      }
      className={cn(
        "heading-sm px-2 capitalize",
        DENSITY_HEADER_HEIGHT_CLASS[layout.density],
        ALIGN_TEXT_CLASS[presets.headerAlign],
        "text-foreground",
        layout.enforceColumnMinWidth &&
          presets.sortable &&
          SCROLL_COLUMN_MIN_WIDTH_CLASS,
        presets.headerClassName,
        column.columnDef.meta?.className,
        className
      )}
      {...props}
    >
      {column.columnDef.meta?.tooltip ? (
        <Tooltip
          label={column.columnDef.meta.tooltip}
          trigger={content}
          // The sort button must be the trigger itself, not nested in one.
          tooltipTriggerAsChild={onSort !== undefined}
        />
      ) : (
        content
      )}
    </th>
  );
}

/** Table body section (tbody). */
export function Body({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className} {...props}>
      {children}
    </tbody>
  );
}

interface RowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
  onClick?: () => void;
  onDoubleClick?: () => void;
  widthClassName: string;
  "data-selected"?: boolean;
  rowData?: TBaseData;
  hideBottomBorder?: boolean;
}

/** Table row (tr) with hover/selection styling and a right-click context menu when rowData.menuItems is set. */
export function Row({
  children,
  className,
  onClick,
  onDoubleClick,
  widthClassName,
  rowData,
  hideBottomBorder = false,
  ...props
}: RowProps) {
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleContextMenu = (event: React.MouseEvent) => {
    if (!rowData?.menuItems?.length) {
      return;
    }

    event.preventDefault();
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
  };

  return (
    <>
      <tr
        className={cn(
          "group/dt-row justify-center transition-colors duration-300 ease-out",
          !hideBottomBorder && ["border-b", "border-separator"],
          (onClick || onDoubleClick) &&
            "cursor-pointer [&:hover:not(:has(input:hover)):not(:has(button:hover))]:bg-muted-background",
          props["data-selected"] && "bg-muted-background/50",
          widthClassName,
          className
        )}
        onClick={onClick || undefined}
        onDoubleClick={onDoubleClick || undefined}
        onContextMenu={handleContextMenu}
        {...props}
      >
        {children}
      </tr>

      {contextMenuPosition && rowData?.menuItems?.length && (
        <DropdownMenu
          open={!!contextMenuPosition}
          onOpenChange={(open) => !open && setContextMenuPosition(null)}
          modal
        >
          <DropdownMenuPortal>
            <DropdownMenuContent
              align="start"
              className="whitespace-nowrap"
              style={{
                position: "fixed",
                left: contextMenuPosition?.x || 0,
                top: contextMenuPosition?.y || 0,
              }}
            >
              <DropdownMenuGroup>
                {rowData?.menuItems?.map((item, index) =>
                  renderMenuItem(item, index, () =>
                    setContextMenuPosition(null)
                  )
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      )}
    </>
  );
}
