import React, { ReactNode, useCallback } from "react";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  Avatar,
  MoreIcon,
} from "@sparkle/index";
import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

interface HeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode;
}

interface HeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  column: string;
  sortable?: boolean;
  children: ReactNode;
}

interface CellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  avatarUrl?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: ReactNode;
}

interface TableChildProps {
  sorting?: SortingState;
  onSort?: (column: string) => void;
}

interface RowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
  clickable?: boolean;
  onClick?: () => void;
}

type SortingState = {
  column: string | null;
  direction: "asc" | "desc";
};

const TableRoot: React.FC<TableProps> = ({ children, className, ...props }) => {
  return (
    <table
      className={classNames("s-w-full s-border-collapse", className || "")}
      {...props}
    >
      {children}
    </table>
  );
};

const Header: React.FC<HeaderProps> = ({ children, className, ...props }) => {
  return (
    <thead
      className={classNames("s-text-xs s-capitalize", className || "")}
      {...props}
    >
      {children}
    </thead>
  );
};

const Head: React.FC<HeadProps & TableChildProps> = ({
  children,
  className,
  column,
  sortable = true,
  sorting,
  onSort,
  ...props
}) => {
  const handleClick = useCallback(() => {
    if (sortable && onSort) {
      onSort(column);
    }
  }, [sortable, onSort, column]);

  return (
    <th
      className={classNames(
        "s-px-4 s-py-2 s-text-left s-font-medium s-text-element-800",
        sortable ? "s-cursor-pointer" : "",
        className || ""
      )}
      onClick={handleClick}
      {...props}
    >
      <div className="s-flex s-items-center s-space-x-1">
        <span>{children}</span>
        {sortable && sorting && (
          <Icon
            visual={
              sorting.column === column
                ? sorting.direction === "asc"
                  ? ArrowUpIcon
                  : ArrowDownIcon
                : ArrowDownIcon
            }
            className="s-h-4 s-w-3 s-font-extralight"
          />
        )}
      </div>
    </th>
  );
};

const Body: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className,
  ...props
}) => (
  <tbody className={className || ""} {...props}>
    {children}
  </tbody>
);

const Footer: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className,
  ...props
}) => (
  <tfoot
    className={classNames(
      "s-border-t s-border-structure-200 s-bg-structure-50",
      className || ""
    )}
    {...props}
  >
    {children}
  </tfoot>
);

const Row: React.FC<RowProps> = ({
  children,
  className,
  clickable = false,
  onClick,
  ...props
}) => (
  <tr
    className={classNames(
      "s-border-b s-border-structure-200 s-text-sm",
      className || ""
    )}
    {...props}
  >
    {children}
    {clickable && (
      <td
        className="s-w-1 s-cursor-pointer s-text-element-600"
        onClick={clickable ? onClick : undefined}
      >
        <Icon visual={MoreIcon} size="sm" />
      </td>
    )}
  </tr>
);

const Cell: React.FC<CellProps> = ({
  children,
  className,
  avatarUrl,
  icon,
  ...props
}) => (
  <td
    className={classNames(
      "s-whitespace-nowrap s-px-4 s-py-4 s-text-element-800",
      className || ""
    )}
    {...props}
  >
    <div className="s-flex">
      {avatarUrl && <Avatar visual={avatarUrl} size="xs" className="s-mr-3" />}
      {icon && (
        <Icon visual={icon} size="sm" className="s-mr-3 s-text-element-600" />
      )}
      {children}
    </div>
  </td>
);

const Caption: React.FC<React.HTMLAttributes<HTMLTableCaptionElement>> = ({
  children,
  className,
  ...props
}) => (
  <caption className={classNames(className || "")} {...props}>
    {children}
  </caption>
);

export const Table = Object.assign(TableRoot, {
  Header,
  Body,
  Footer,
  Head,
  Row,
  Cell,
  Caption,
});
