import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type {
  CellCursors,
  GlobalAgentFeedbackItemWithCell,
} from "@app/hooks/usePokeGlobalAgentFeedbacks";
import {
  nextExhaustedCells,
  nextFeedbackCursors,
  usePokeGlobalAgentFeedbacksAllCells,
} from "@app/hooks/usePokeGlobalAgentFeedbacks";
import { useCellContext } from "@app/lib/auth/CellContext";
import { getCellChipColor, getCellDisplay } from "@app/lib/poke/cells";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import type { CellType } from "@app/types/cell";
import {
  Button,
  CheckboxWithText,
  Chip,
  LinkWrapper,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

interface MakeColumnsParams {
  onSwitchCell: (cell: CellType) => void;
}

function makeColumns({
  onSwitchCell,
}: MakeColumnsParams): ColumnDef<GlobalAgentFeedbackItemWithCell>[] {
  return [
    {
      id: "cell",
      accessorKey: "cell",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Cell" />
      ),
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
      cell: ({ row }) => (
        <Chip
          size="mini"
          color={getCellChipColor(row.original.region)}
          label={getCellDisplay({
            name: row.original.cell,
            region: row.original.region,
          })}
        />
      ),
    },
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
            color={thumbDirection === "up" ? "success" : "warning"}
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
              <div className="text-xs text-primary-500">
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
          <div onClick={() => onSwitchCell(feedback.cell)}>
            <LinkWrapper href={`/poke/${feedback.workspaceId}`}>
              <span className="text-highlight-600 hover:underline">
                {feedback.workspaceName}
              </span>
            </LinkWrapper>
          </div>
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
          feedback.conversationId &&
          feedback.workspaceId !== "unknown"
        ) {
          return (
            <div onClick={() => onSwitchCell(feedback.cell)}>
              <LinkWrapper
                href={`/poke/${feedback.workspaceId}/conversation/${feedback.conversationId}`}
              >
                <span className="text-highlight-600 hover:underline">View</span>
              </LinkWrapper>
            </div>
          );
        }
        return <span className="text-gray-400">-</span>;
      },
    },
  ];
}

export function GlobalAgentFeedbacksPage() {
  usePokePageMetadata({ name: "Global Agent Feedbacks" });

  const { cells, cellInfo, setCellInfo } = useCellContext();

  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [cursors, setCursors] = useState<CellCursors>({});
  const [exhaustedCells, setExhaustedCells] = useState<Set<CellType>>(
    () => new Set()
  );
  const [cursorHistory, setCursorHistory] = useState<CellCursors[]>([]);
  const [exhaustedHistory, setExhaustedHistory] = useState<Set<CellType>[]>([]);

  const { feedbacks, hasMore, hasMoreByCell, isLoading } =
    usePokeGlobalAgentFeedbacksAllCells({
      includeEmpty,
      cursors,
      exhaustedCells,
    });

  const switchToCell = useCallback(
    (cell: CellType) => {
      const targetCell = cells.find((c) => c.name === cell);
      if (targetCell && targetCell.name !== cellInfo.name) {
        setCellInfo(targetCell);
      }
    },
    [cells, cellInfo, setCellInfo]
  );

  const columns = useMemo(
    () => makeColumns({ onSwitchCell: switchToCell }),
    [switchToCell]
  );

  const cellFacetOptions = useMemo(
    () =>
      cells.map((cell) => ({
        label: getCellDisplay(cell),
        value: cell.name,
      })),
    [cells]
  );

  const handleNextPage = () => {
    setCursorHistory((prev) => [...prev, cursors]);
    setExhaustedHistory((prev) => [...prev, exhaustedCells]);
    setCursors(nextFeedbackCursors(feedbacks, cursors, hasMoreByCell));
    setExhaustedCells(nextExhaustedCells(exhaustedCells, hasMoreByCell));
  };

  const handlePrevPage = () => {
    const prevCursors = cursorHistory[cursorHistory.length - 1] ?? {};
    const prevExhausted =
      exhaustedHistory[exhaustedHistory.length - 1] ?? new Set<CellType>();
    setCursorHistory((prev) => prev.slice(0, -1));
    setExhaustedHistory((prev) => prev.slice(0, -1));
    setCursors(prevCursors);
    setExhaustedCells(prevExhausted);
  };

  const handleIncludeEmptyChange = () => {
    setIncludeEmpty((prev) => !prev);
    setCursors({});
    setExhaustedCells(new Set());
    setCursorHistory([]);
    setExhaustedHistory([]);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-primary-900">
            Global Agent Feedback
          </h1>
          <p className="mt-1 text-sm text-primary-600">
            User feedback on global agents across all workspaces and cells.
          </p>
        </div>

        <div className="mb-4 flex items-center gap-4">
          <CheckboxWithText
            text="Include feedback without content"
            checked={includeEmpty}
            onCheckedChange={handleIncludeEmptyChange}
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <>
            <PokeDataTable
              columns={columns}
              data={feedbacks}
              pageSize={25}
              facets={[
                {
                  columnId: "cell",
                  title: "Cell",
                  options: cellFacetOptions,
                },
              ]}
            />

            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                label="Previous batch"
                onClick={handlePrevPage}
                disabled={cursorHistory.length === 0}
              />
              <span className="text-sm text-primary-500">
                Batch {cursorHistory.length + 1}
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
