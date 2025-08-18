import {
  Button,
  ClipboardCheckIcon,
  ClipboardIcon,
  Label,
  LinkWrapper,
} from "@dust-tt/sparkle";
import * as React from "react";

import { cn } from "@app/components/poke/shadcn/lib/utils";

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
  <thead
    ref={ref}
    className={cn("items-center [&_tr]:border-b", className)}
    {...props}
  />
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
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
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
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      "dark:hover:bg-muted/10 dark:data-[state=selected]:bg-muted-night",
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
      "h-10 px-2 text-left align-middle font-medium text-muted-foreground",
      "dark:text-muted-foreground-night [&:has([role=checkbox])]:pr-0",
      "[&>[role=checkbox]]:translate-y-[2px]",
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
    className={cn(
      "mt-4 text-sm text-muted-foreground dark:text-muted-foreground-night",
      className
    )}
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
        <Label>{label}</Label>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopy}
          icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
        />
      </div>
    </TableCell>
  );
});
TableCellWithCopy.displayName = "TableCellWithCopy";

interface TableCellWithLinkProps
  extends React.TdHTMLAttributes<HTMLTableCellElement> {
  href: string;
  content: string;
}

const TableCellWithLink = React.forwardRef<
  HTMLTableCellElement,
  TableCellWithLinkProps
>(({ className, href, content, ...props }, ref) => {
  return (
    <TableCell
      ref={ref}
      className={cn("p-2 align-middle", className)}
      {...props}
    >
      <LinkWrapper href={href}>{content}</LinkWrapper>
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
