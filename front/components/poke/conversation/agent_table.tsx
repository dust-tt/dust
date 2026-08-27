import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeListConversationItem } from "@app/lib/api/poke/conversations";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { usePokeAgentConversations } from "@app/poke/swr/conversation";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Chip, IconButton, Input, LinkWrapper } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

const PAGE_SIZE = 25;

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
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // A narrower window makes the rows already loaded meaningless, so start over.
  const handleFromChange = (value: string) => {
    setFrom(value);
    setLimit(PAGE_SIZE);
  };

  const handleToChange = (value: string) => {
    setTo(value);
    setLimit(PAGE_SIZE);
  };

  const handleClearDates = () => {
    setFrom("");
    setTo("");
    setLimit(PAGE_SIZE);
  };

  const useConversationsWithAgent = (props: PokeConditionalFetchProps) =>
    usePokeAgentConversations({
      ...props,
      agentId,
      limit,
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
      {({ conversations, hasMore, isLoadingMore }) => (
        <div className="flex flex-col gap-3">
          <PokeDataTable<PokeListConversationItem, unknown>
            columns={makeColumnsForConversations(owner)}
            data={conversations}
            pageSize={PAGE_SIZE}
          />
          {hasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                label="Load more"
                isLoading={isLoadingMore}
                onClick={() => setLimit((current) => current + PAGE_SIZE)}
              />
            </div>
          )}
        </div>
      )}
    </PokeDataTableConditionalFetch>
  );
}
