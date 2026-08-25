import { CreditsCell } from "@app/components/workspace/analytics/creditsTableCells";
import { useConsumptionTopConversations } from "@app/hooks/useConsumptionTopConversations";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { ConsumptionTopConversationRow } from "@app/lib/api/analytics/consumption/top_conversations";
import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import { ArrowRight, Button, DataTable, Spinner } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

type ConversationAttributionRow = ConsumptionTopConversationRow & {
  onOpen: () => void;
  // DataTable requires rows to share one of its interaction props. Navigation
  // stays scoped to the explicit action cell.
  onClick?: never;
};

const CONVERSATION_COLUMNS: ColumnDef<ConversationAttributionRow>[] = [
  {
    id: "conversation",
    header: "Conversation",
    cell: ({ row }) => (
      <DataTable.CellContent className="w-full justify-start text-left">
        <span className="truncate text-sm">
          {row.original.title || "Untitled conversation"}
        </span>
      </DataTable.CellContent>
    ),
    enableSorting: false,
  },
  {
    id: "totalCredits",
    header: "Total Credits",
    cell: ({ row }) => <CreditsCell credits={row.original.totalCredits} />,
    enableSorting: false,
    meta: {
      className: "w-32 text-right",
      headerAlign: "right",
    },
  },
  {
    id: "open",
    header: "",
    enableSorting: false,
    meta: { className: "w-12 p-0", headerAlign: "right" },
    cell: ({ row }) => {
      const title = row.original.title || "Untitled conversation";
      return (
        <Button
          icon={ArrowRight}
          variant="ghost-secondary"
          size="xs"
          className="h-12 w-full rounded-none"
          tooltip="Open conversation"
          aria-label={`Open ${title}`}
          onClick={row.original.onOpen}
        />
      );
    },
  },
];

export interface ConsumptionConversationAttributionProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  disabled?: boolean;
  onNavigate?: () => void;
}

export function ConsumptionConversationAttribution({
  workspaceId,
  period,
  filter,
  disabled,
  onNavigate,
}: ConsumptionConversationAttributionProps) {
  const router = useAppRouter();
  const { conversations, isTopConversationsLoading, isTopConversationsError } =
    useConsumptionTopConversations({
      workspaceId,
      period,
      filter,
      disabled,
    });

  if (isTopConversationsError) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load attribution.
      </div>
    );
  }

  if (isTopConversationsLoading) {
    return (
      <div className="flex justify-center py-2">
        <Spinner size="sm" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No consumption over this period.
      </div>
    );
  }

  const rows: ConversationAttributionRow[] = conversations.map(
    (conversation) => ({
      ...conversation,
      onOpen: () => {
        onNavigate?.();
        void router.push(
          getConversationRoute(workspaceId, conversation.conversationId)
        );
      },
    })
  );

  return (
    <DataTable<ConversationAttributionRow>
      data={rows}
      columns={CONVERSATION_COLUMNS}
      getRowId={(row) => row.conversationId}
    />
  );
}
