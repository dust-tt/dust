import {
  ClipboardCheckIcon,
  ClipboardIcon,
  ExternalLinkIcon,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { cn } from "@app/components/poke/shadcn/lib/utils";
import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import { PokeLabel } from "@app/components/poke/shadcn/ui/label";
import PokeLink from "@app/components/poke/shadcn/ui/link";

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
      className
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "text-muted-foreground h-10 px-2 text-left align-middle font-medium [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("text-muted-foreground mt-4 text-sm", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

const TableCellWithCopy = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & {
    label: string;
    textToCopy?: string;
  }
>(({ className, label, textToCopy, ...props }, ref) => {
  const [isCopied, setIsCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(textToCopy ?? label);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <TableCell
      ref={ref}
      className={cn(
        "p-2 align-middle [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    >
      <div className="flex items-center space-x-2">
        <PokeLabel>{label}</PokeLabel>
        <PokeButton size="sm" variant="outline" onClick={handleCopy}>
          {isCopied ? (
            <ClipboardCheckIcon className="h-4 w-4" />
          ) : (
            <ClipboardIcon className="h-4 w-4" />
          )}
        </PokeButton>
      </div>
    </TableCell>
  );
});
TableCellWithCopy.displayName = "TableCellWithCopy";

interface TableCellWithLinkProps
  extends React.TdHTMLAttributes<HTMLTableCellElement> {
  href: string;
  content: string;
  external?: boolean;
}

const TableCellWithLink = React.forwardRef<
  HTMLTableCellElement,
  TableCellWithLinkProps
>(({ className, href, content, external = false, ...props }, ref) => {
  return (
    <TableCell
      ref={ref}
      className={cn("p-2 align-middle", className)}
      {...props}
    >
      <PokeLink href={href} external={external}>
        {content}
      </PokeLink>
    </TableCell>
  );
});
TableCellWithLink.displayName = "TableCellWithLink";

export {
  Table as PokeTable,
  TableBody as PokeTableBody,
  TableCaption as PokeTableCaption,
  TableCell as PokeTableCell,
  TableCellWithCopy as PokeTableCellWithCopy,
  TableCellWithLink as PokeTableCellWithLink,
  TableFooter as PokeTableFooter,
  TableHead as PokeTableHead,
  TableHeader as PokeTableHeader,
  TableRow as PokeTableRow,
};
