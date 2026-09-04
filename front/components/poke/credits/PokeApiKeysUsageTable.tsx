import { ReconcileCreditStateButton } from "@app/components/poke/credits/ReconcileCreditStateButton";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { ApiKeyUsageType } from "@app/lib/api/credits/api_keys_usage";
import type { RateLimiterState } from "@app/lib/api/credits/members_usage";
import { formatCredits, formatCreditsPrecise } from "@app/lib/client/credits";
import { usePokeApiKeysUsage } from "@app/poke/swr/credits";
import type { ApiKeyCreditState } from "@app/types/key";
import type { WorkspaceType } from "@app/types/user";
import {
  AlertCircle,
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessage,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

const API_KEY_CREDIT_STATE_CHIP_COLOR: Record<
  ApiKeyCreditState,
  "success" | "warning"
> = {
  on_pool: "success",
  capped: "warning",
};

// The rate-limiter's verdict, rendered as a chip. Labels distinguish capped vs
// near-limit (both warning-toned). Mirrors PokeMembersUsageTable.
const RATE_LIMITER_STATE_CHIP: Record<
  RateLimiterState,
  { color: "success" | "warning"; label: string }
> = {
  capped: { color: "warning", label: "capped" },
  near_limit: { color: "warning", label: "near limit" },
  ok: { color: "success", label: "ok" },
};

interface PokeApiKeysUsageTableProps {
  owner: WorkspaceType;
}

function makeColumns({
  owner,
  onReconciled,
}: {
  owner: WorkspaceType;
  onReconciled: () => void;
}): ColumnDef<ApiKeyUsageType>[] {
  return [
    {
      accessorKey: "name",
      header: "API key",
      cell: ({ row }) => {
        const { name, isActive } = row.original;
        return (
          <span className="inline-flex items-center gap-2">
            <span className="font-medium">{name}</span>
            {!isActive && <Chip size="xs" color="warning" label="revoked" />}
          </span>
        );
      },
    },
    {
      accessorKey: "consumedAwuCredits",
      // ES = Elasticsearch, RL = Redis rate-limiter counter, MT = Metronome.
      // The three should agree; divergence points at a counter/metric issue.
      // ES and MT are aggregated on `api_key_name` (like the cap itself), so
      // keys sharing a name show the same figure; RL is per key.
      header: "Consumed (ES / RL / MT)",
      cell: ({ row }) => {
        const {
          consumedAwuCredits,
          rateLimiterSpendAwuCredits,
          metronomeConsumedAwuCredits,
        } = row.original;
        return (
          <div className="flex flex-col text-xs">
            <span>ES {formatCreditsPrecise(consumedAwuCredits)}</span>
            <span className="text-muted-foreground">
              RL{" "}
              {rateLimiterSpendAwuCredits !== null
                ? formatCreditsPrecise(rateLimiterSpendAwuCredits)
                : "-"}
            </span>
            <span className="text-muted-foreground">
              MT{" "}
              {metronomeConsumedAwuCredits !== null
                ? formatCreditsPrecise(metronomeConsumedAwuCredits)
                : "-"}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "monthlyCapAwuCredits",
      header: "Key cap",
      cell: ({ row }) => {
        const { monthlyCapAwuCredits } = row.original;
        return (
          <span>
            {monthlyCapAwuCredits !== null
              ? formatCredits(monthlyCapAwuCredits)
              : "—"}
          </span>
        );
      },
    },
    {
      accessorKey: "creditState",
      header: "Credit state",
      cell: ({ row }) => {
        const { creditState } = row.original;
        return (
          <Chip
            size="xs"
            color={API_KEY_CREDIT_STATE_CHIP_COLOR[creditState]}
            label={creditState}
          />
        );
      },
    },
    {
      accessorKey: "rateLimiterState",
      header: "Rate limiter state",
      enableSorting: false,
      cell: ({ row }) => {
        const { rateLimiterState } = row.original;
        if (rateLimiterState === null) {
          return <span>—</span>;
        }
        const { color, label } = RATE_LIMITER_STATE_CHIP[rateLimiterState];
        return <Chip size="xs" color={color} label={label} />;
      },
    },
    {
      id: "actions",
      header: () => null,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-end">
          <ReconcileCreditStateButton
            owner={owner}
            target="api_key"
            keyName={row.original.name}
            onReconciled={onReconciled}
          />
        </div>
      ),
    },
  ];
}

interface PokeApiKeysUsageTableContentProps {
  isOpen: boolean;
  owner: WorkspaceType;
}

function PokeApiKeysUsageTableContent({
  isOpen,
  owner,
}: PokeApiKeysUsageTableContentProps) {
  const {
    apiKeys,
    isApiKeysUsageLoading,
    isApiKeysUsageError,
    mutateApiKeysUsage,
  } = usePokeApiKeysUsage({ owner, disabled: !isOpen });

  const columns = useMemo(
    () =>
      makeColumns({
        owner,
        onReconciled: () => void mutateApiKeysUsage(),
      }),
    [owner, mutateApiKeysUsage]
  );

  if (isApiKeysUsageError) {
    return (
      <ContentMessage
        title="Failed to load API keys usage"
        icon={AlertCircle}
        variant="warning"
      >
        Could not load per-API-key consumption and cap data for this workspace.
      </ContentMessage>
    );
  }

  return (
    <PokeDataTable
      columns={columns}
      data={apiKeys}
      defaultFilterColumn="name"
      isLoading={isApiKeysUsageLoading}
    />
  );
}

// Collapsed by default: each expansion fans out to Elasticsearch, Metronome and
// one Redis read per key, which is wasted work on a workspace with many keys
// nobody is looking at. The hook is disabled until the section is opened.
export function PokeApiKeysUsageTable({ owner }: PokeApiKeysUsageTableProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <Collapsible defaultOpen={false} onOpenChange={setIsOpen}>
        <CollapsibleTrigger label="API keys credit states" />
        <CollapsibleContent>
          <PokeApiKeysUsageTableContent isOpen={isOpen} owner={owner} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
