import React, { ReactNode } from "react";

import { Page } from "@sparkle/index";
import { ClipboardCheckIcon, ClipboardIcon, IconButton } from "@sparkle/index";
import { useCopyToClipboard } from "@sparkle/lib/utils";

type SupportedRowType = string | number;

interface DataTableProps {
  name?: string;
  columns: string[];
  rows: SupportedRowType[][];
  enableCopy?: boolean;
  showLimit?: number;
  downloadButton?: ReactNode;
}

export const DataTable = React.forwardRef<HTMLTableElement, DataTableProps>(
  (
    {
      name,
      columns,
      rows,
      enableCopy,
      showLimit,
      downloadButton,
    }: DataTableProps,
    ref
  ) => {
    const [isCopied, copyToClipboard] = useCopyToClipboard();

    const handleCopyTable = async () => {
      const columnHeaders = columns.join(",");
      const data = rows.map((row) => row.join(",")).join("\n");
      const clipboardText = `${columnHeaders}\n${data}`;

      if (copyToClipboard) {
        await copyToClipboard(
          new ClipboardItem({
            "text/plain": new Blob([clipboardText], {
              type: "text/plain",
            }),
          })
        );
      }
    };

    const maxRows = showLimit ?? -1;

    return (
      <div className="s-mt-2 s-flex s-flex-col s-gap-2">
        <div className="s-flex s-w-full s-items-center s-justify-between s-gap-1">
          {name && <Page.H variant="h6">{name}</Page.H>}
          {downloadButton}
        </div>
        <div className="s-relative">
          <div className="relative overflow-x-auto s-dark:border-structure-200-dark s-w-auto s-rounded-lg s-border s-border-structure-200">
            <table
              ref={ref}
              className="s-w-full s-table-auto s-divide-y s-divide-structure-200"
            >
              <thead className="s-dark:bg-structure-50-dark s-bg-structure-50 s-px-2 s-py-2">
                <tr>
                  <th className="s-px-4"></th>
                  {columns.map((column, index) => (
                    <th
                      className="s-dark:text-element-700-dark s-whitespace-nowrap s-px-6 s-py-2 s-text-left s-text-xs s-font-semibold s-uppercase s-tracking-wider s-text-element-700"
                      key={index}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="s-dark:divide-structure-600 s-divide-y s-divide-structure-100 s-bg-white">
                {rows.slice(0, maxRows).map((row, index) => (
                  <tr key={index}>
                    <td className="s-dark:text-element-800-dark s-px-4 s-text-sm s-text-element-600">
                      {index + 1}
                    </td>
                    {row.map((cell, cellIndex) => (
                      <td
                        className="s-dark:text-element-800-dark s-px-6 s-py-3 s-text-sm s-text-element-800"
                        key={cellIndex}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {enableCopy && (
              <div className="s-absolute s-right-2 s-top-2 s-mx-2 s-rounded-xl s-bg-structure-50">
                <IconButton
                  variant="tertiary"
                  size="xs"
                  icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
                  onClick={handleCopyTable}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);
