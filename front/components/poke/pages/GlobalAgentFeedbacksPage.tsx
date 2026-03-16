import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeGlobalAgentFeedbacks } from "@app/hooks/usePokeGlobalAgentFeedbacks";
import type { GlobalAgentFeedbackItem } from "@app/pages/api/poke/global-agent-feedbacks";
import { Button, Chip, LinkWrapper, Spinner } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

function makeColumns(): ColumnDef<GlobalAgentFeedbackItem>[] {
  return [
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Date" />
      ),
      cell: ({ row }) => {
        const date = new Date(row.original.createdAt);
        return (
          <span className="whitespace-nowrap">
            {date.toLocaleDateString()} {date.toLocaleTimeString()}
          </span>
        );
      },
    },
    {
      accessorKey: "agentConfigurationId",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Agent" />
      ),
    },
    {
      accessorKey: "thumbDirection",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Vote" />
      ),
      cell: ({ row }) => {
        const { thumbDirection } = row.original;
        return (
          <Chip
            color={thumbDirection === "up" ? "green" : "rose"}
            size="xs"
            label={thumbDirection === "up" ? "up" : "down"}
          />
        );
      },
    },
    {
      accessorKey: "userName",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="User" />
      ),
      cell: ({ row }) => {
        const feedback = row.original;
        return (
          <div>
            <div>{feedback.userName ?? "Unknown"}</div>
            {feedback.userEmail && (
              <div className="text-xs text-gray-500 dark:text-muted-foreground-night">
                {feedback.userEmail}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "workspaceName",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Workspace" />
      ),
      cell: ({ row }) => {
        const feedback = row.original;
        return (
          <LinkWrapper href={`/poke/${feedback.workspaceSId}`}>
            <span className="text-blue-600 hover:underline dark:text-blue-400">
              {feedback.workspaceName}
            </span>
          </LinkWrapper>
        );
      },
    },
    {
      accessorKey: "content",
      header: "Content",
      enableSorting: false,
      cell: ({ row }) => {
        const { content } = row.original;
        return <div className="whitespace-pre-wrap">{content ?? "-"}</div>;
      },
    },
    {
      id: "link",
      header: "Conversation",
      cell: ({ row }) => {
        const feedback = row.original;
        if (
          feedback.isConversationShared &&
          feedback.conversationSId &&
          feedback.workspaceSId !== "unknown"
        ) {
          return (
            <LinkWrapper
              href={`/poke/${feedback.workspaceSId}/conversation/${feedback.conversationSId}`}
            >
              <span className="text-blue-600 hover:underline dark:text-blue-400">
                View
              </span>
            </LinkWrapper>
          );
        }
        return <span className="text-gray-400">-</span>;
      },
    },
  ];
}

export function GlobalAgentFeedbacksPage() {
  useSetPokePageTitle("Global Agent Feedbacks");

  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [pages, setPages] = useState<number[]>([]);

  const currentLastId = pages.length > 0 ? pages[pages.length - 1] : null;

  const { feedbacks, hasMore, isLoading } = usePokeGlobalAgentFeedbacks({
    includeEmpty,
    lastId: currentLastId,
  });

  const columns = useMemo(() => makeColumns(), []);

  const handleNextPage = () => {
    if (feedbacks.length > 0) {
      const lastFeedback = feedbacks[feedbacks.length - 1];
      setPages((prev) => [...prev, lastFeedback.id]);
    }
  };

  const handlePrevPage = () => {
    setPages((prev) => prev.slice(0, -1));
  };

  const handleIncludeEmptyChange = () => {
    setIncludeEmpty((prev) => !prev);
    setPages([]);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground-night">
            Global Agent Feedback
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-muted-foreground-night">
            User feedback on global agents across all workspaces.
          </p>
        </div>

        <div className="mb-4 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={includeEmpty}
              onChange={handleIncludeEmptyChange}
              className="rounded"
            />
            Include feedback without content
          </label>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <>
            <PokeDataTable columns={columns} data={feedbacks} pageSize={25} />

            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                label="Previous batch"
                onClick={handlePrevPage}
                disabled={pages.length === 0}
              />
              <span className="text-sm text-gray-500 dark:text-muted-foreground-night">
                Batch {pages.length + 1}
                {hasMore ? " (more available)" : " (last)"}
              </span>
              <Button
                variant="outline"
                size="sm"
                label="Next batch"
                onClick={handleNextPage}
                disabled={!hasMore}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
