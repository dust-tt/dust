import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeListConversationItem } from "@app/lib/api/poke/conversations";
import type { AgentConversationsOrderColumn } from "@app/lib/resources/conversation_resource";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { usePokeAgentConversations } from "@app/poke/swr/conversation";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Chip, IconButton, Input, LinkWrapper } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { useState } from "react";

const PAGE_SIZE = 25;

// The sortable columns, keyed by the `accessorKey` the table reports.
const ORDER_COLUMN_BY_TABLE_COLUMN: Record<
  string,
  AgentConversationsOrderColumn
> = {
  sId: "sId",
  created: "createdAt",
  title: "title",
};

interface ConversationAgentDataTableProps {
  owner: LightWorkspaceType;
  agentId: string;
}

const makeColumnsForConversations = (
  owner: LightWorkspaceType
): ColumnDef<PokeListConversationItem>[] => {
  return [
    {
      accessorKey: "sId",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Conversation ID</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
      cell: ({ row }) => {
        const conversation = row.original;
        return (
          <LinkWrapper
            href={`/poke/${owner.sId}/conversation/${conversation.sId}`}
          >
            {conversation.sId}
          </LinkWrapper>
        );
      },
    },
    {
      accessorKey: "created",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Created at</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
      cell: ({ row }) => {
        return formatTimestampToFriendlyDate(row.original.created);
      },
    },
    {
      accessorKey: "title",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Title</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      accessorKey: "visibility",
      header: "Status",
      cell: ({ row }) => {
        if (row.original.visibility === "deleted") {
          return <Chip color="warning" label="Deleted" size="xs" />;
        }
        return null;
      },
    },
  ];
};

export function ConversationAgentDataTable({
  owner,
  agentId,
}: ConversationAgentDataTableProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: "created", desc: true },
  ]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const resetToFirstPage = () =>
    setPagination((current) => ({ ...current, pageIndex: 0 }));

  // A different window or order makes the current page number meaningless.
  const handleFromChange = (value: string) => {
    setFrom(value);
    resetToFirstPage();
  };

  const handleToChange = (value: string) => {
    setTo(value);
    resetToFirstPage();
  };

  const handleClearDates = () => {
    setFrom("");
    setTo("");
    resetToFirstPage();
  };

  const handleSortingChange = (nextSorting: SortingState) => {
    setSorting(nextSorting);
    resetToFirstPage();
  };

  const sortColumn = sorting[0];
  const useConversationsWithAgent = (props: PokeConditionalFetchProps) =>
    usePokeAgentConversations({
      ...props,
      agentId,
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
      orderColumn:
        (sortColumn && ORDER_COLUMN_BY_TABLE_COLUMN[sortColumn.id]) ??
        "createdAt",
      orderDirection: sortColumn?.desc === false ? "asc" : "desc",
      from: from || undefined,
      to: to || undefined,
    });

  return (
    <PokeDataTableConditionalFetch
      header="Conversations"
      owner={owner}
      globalActions={
        <div className="flex items-end gap-2">
          <Input
            label="Created from"
            name="from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => handleFromChange(e.target.value)}
          />
          <Input
            label="to"
            name="to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => handleToChange(e.target.value)}
          />
          {(from || to) && (
            <Button variant="ghost" label="Clear" onClick={handleClearDates} />
          )}
        </div>
      }
      useSWRHook={useConversationsWithAgent}
    >
      {({ conversations, totalCount, isValidating }) => (
        <PokeDataTable<PokeListConversationItem, unknown>
          columns={makeColumnsForConversations(owner)}
          data={conversations}
          isValidating={isValidating}
          serverSideRowCount={totalCount}
          pagination={pagination}
          onPaginationChange={setPagination}
          sorting={sorting}
          onSortingChange={handleSortingChange}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
