import React, { ReactNode, useCallback, useState } from "react";

import { Avatar, ChevronDownIcon, ChevronUpIcon } from "@sparkle/index";
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

type SortingState = {
  column: string | null;
  direction: "asc" | "desc";
};

interface TableChildProps {
  sorting?: SortingState;
  onSort?: (column: string) => void;
}

// Update the TableRoot component
const TableRoot: React.FC<TableProps> = ({ children, className, ...props }) => {
  const [sorting, setSorting] = useState<SortingState>({
    column: null,
    direction: "asc",
  });

  const handleSort = useCallback((column: string) => {
    setSorting((prev) => ({
      column,
      direction:
        prev.column === column && prev.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  return (
    <table
      className={classNames(
        "s-w-full s-table-auto s-border-collapse",
        className || ""
      )}
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement<TableChildProps>(child)) {
          return React.cloneElement(child, { sorting, onSort: handleSort });
        }
        return child;
      })}
    </table>
  );
};

const Header: React.FC<HeaderProps> = ({ children, className, ...props }) => {
  return (
    <thead
      className={classNames(
        "s-border-b s-border-structure-200 s-bg-structure-50",
        className || ""
      )}
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
        "s-px-4 s-py-2 s-text-left s-font-medium s-text-element-700",
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
                  ? ChevronUpIcon
                  : ChevronDownIcon
                : ChevronDownIcon
            }
            className="s-h-4 s-w-4 s-text-element-500"
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

const Row: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({
  children,
  className,
  ...props
}) => (
  <tr
    className={classNames(
      "s-hover:bg-structure-50 s-border-b s-border-structure-200",
      className || ""
    )}
    {...props}
  >
    {children}
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
    className={classNames("s-px-4 s-py-2 s-text-element-800", className || "")}
    {...props}
  >
    <div className="s-flex">
      {avatarUrl &&
        <Avatar visual={avatarUrl} size="xs" className="s-mr-2" />
      }
      {icon && (
        <Icon visual={icon} size="sm" className="s-mr-2 s-text-element-600" />
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
  <caption
    className={classNames(
      "s-mt-4 s-text-sm s-text-element-600",
      className || ""
    )}
    {...props}
  >
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
