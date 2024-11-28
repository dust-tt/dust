import { Avatar, DataTable, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@dust-tt/sparkle";
import { ChevronDownIcon } from "@dust-tt/sparkle";
import { type ColumnDef } from "@tanstack/react-table";
import React, { useEffect, useRef, useState } from "react";

export type TableData = {
  name: string;
  message: number;
  feedback: number;
  version: string;
};

interface TableProps {
  data: TableData[];
}

export function Table({ data }: TableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showShadow, setShowShadow] = useState(false);

  const handleScroll = () => {
    if (scrollRef.current) {
      setShowShadow(scrollRef.current.scrollLeft > 0);
    }
  };

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.addEventListener('scroll', handleScroll);
      return () => scrollElement.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const columns: ColumnDef<TableData>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: () => (
        <div className="s-py-4 s-pl-4 s-font-medium">Name</div>
      ),
      cell: ({ row }) => (
        <div className="s-flex s-items-center s-gap-2 s-pl-4">
          <Avatar
            name="TableRow"
            emoji="🤖"
            size="sm"
            isRounded={false}
          />
          <span className="s-font-medium">{row.original.name}</span>
        </div>
      ),
      meta: {
        className: "s-w-80",
      },
    },
    {
      id: "message",
      accessorKey: "message",
      header: () => (
        <div className="s-py-4 s-pl-4">Message (last 30 days)</div>
      ),
      cell: ({ row }) => (
        <span className="s-font-semibold s-pl-4">{row.original.message}</span>
      ),
      meta: {
        className: "s-min-w-[16rem]",
      },
    },
    {
      id: "feedback",
      accessorKey: "feedback",
      header: () => (
        <div className="s-py-4 s-pl-4">Feedback (last 30 days)</div>
      ),
      cell: ({ row }) => (
        <span className="s-font-normal s-pl-4">{row.original.feedback}</span>
      ),
      meta: {
        className: "s-min-w-[16rem]",
      },
    },
    {
      id: "version",
      accessorKey: "version",
      header: () => (
        <div className="s-py-4 s-pl-4">Version</div>
      ),
      cell: ({ row }) => (
        <div className="s-pl-4">
          <DropdownMenu>
            <DropdownMenuTrigger className="s-w-full">
              <div className="s-flex s-items-center s-gap-1 s-cursor-pointer hover:s-bg-structure-50 s-px-2 s-py-1 s-rounded">
                <span className="s-font-light">{row.original.version}</span>
                <ChevronDownIcon className="s-h-4 s-w-4 s-text-element-600" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="s-w-48">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => console.log("View details", row.original.version)}>
                  View details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => console.log("Download version", row.original.version)}>
                  Download version
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => console.log("Copy version", row.original.version)}>
                  Copy version number
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      meta: {
        className: "s-min-w-[16rem]",
      },
    },
  ];

  const shadowClasses = showShadow 
    ? "s-shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" 
    : "";

  return (
    <div className="s-w-[1400px] s-max-w-full">
      <div className="s-w-full s-overflow-x-auto" ref={scrollRef}>
        <div className={`s-min-w-[800px] [&_table_th:first-child]:s-sticky [&_table_th:first-child]:s-left-0 [&_table_th:first-child]:s-z-20 [&_table_th:first-child]:s-bg-white [&_table_td:first-child]:s-sticky [&_table_td:first-child]:s-left-0 [&_table_td:first-child]:s-z-10 [&_table_td:first-child]:s-bg-white [&_table_th:first-child]:${shadowClasses} [&_table_td:first-child]:${shadowClasses}`}>
          <DataTable
            data={data}
            columns={columns}
            className="s-w-full [&_thead]:s-sticky [&_thead]:s-top-0 [&_thead]:s-bg-white [&_thead]:s-z-30 [&_tr]:s-border-b [&_tr]:s-border-structure-200"
            widthClassName="s-w-full"
          />
        </div>
      </div>
    </div>
  );
}
