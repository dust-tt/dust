import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { TYPE_COLORS } from "@app/components/workspace/CreditsList";
import { getMetronomeCommitOrCreditUrl } from "@app/lib/metronome/urls";
import type { PokeUnifiedCreditRow } from "@app/pages/api/poke/workspaces/[wId]/credits";
import { dateToHumanReadable } from "@app/types/shared/utils/date_utils";
import { Chip, LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

export function formatMicroUsdToUsd(microUsdAmount: number): string {
  return `$${(microUsdAmount / 1_000_000).toFixed(2)}`;
}

function pickInternal<T>(
  row: PokeUnifiedCreditRow,
  fn: (i: NonNullable<PokeUnifiedCreditRow["internal"]>) => T
): T | null {
  return row.internal ? fn(row.internal) : null;
}

function pickMetronome<T>(
  row: PokeUnifiedCreditRow,
  fn: (m: NonNullable<PokeUnifiedCreditRow["metronome"]>) => T
): T | null {
  return row.metronome ? fn(row.metronome) : null;
}

function getRowType(row: PokeUnifiedCreditRow) {
  return row.internal?.type ?? row.metronome?.type ?? null;
}

function getRowStartDateMs(row: PokeUnifiedCreditRow): number | null {
  const dbStart = row.internal?.startDate;
  if (dbStart) {
    return new Date(dbStart).getTime();
  }
  return row.metronome?.startDate ?? null;
}

function getRowExpirationDateMs(row: PokeUnifiedCreditRow): number | null {
  const dbEnd = row.internal?.expirationDate;
  if (dbEnd) {
    return new Date(dbEnd).getTime();
  }
  return row.metronome?.expirationDate ?? null;
}

function AmountCell({
  internal,
  metronome,
}: {
  internal: number | null;
  metronome: number | null;
}) {
  if (internal === null && metronome === null) {
    return <span className="text-gray-400">—</span>;
  }
  if (internal === null) {
    return (
      <div className="flex flex-col text-xs">
        <span className="text-gray-400">DB: —</span>
        <span className="text-warning-700 dark:text-warning-700-night">
          M: {formatMicroUsdToUsd(metronome ?? 0)}
        </span>
      </div>
    );
  }
  if (metronome === null) {
    return (
      <div className="flex flex-col text-xs">
        <span>DB: {formatMicroUsdToUsd(internal)}</span>
        <span className="text-warning-700 dark:text-warning-700-night">
          M: —
        </span>
      </div>
    );
  }
  // Tolerate sub-cent rounding from the credit-unit conversion.
  const matches = Math.abs(internal - metronome) < 10_000;
  const className = matches
    ? "text-muted-foreground dark:text-muted-foreground-night"
    : "text-red-600 dark:text-red-400";
  return (
    <div className="flex flex-col text-xs">
      <span>DB: {formatMicroUsdToUsd(internal)}</span>
      <span className={className}>M: {formatMicroUsdToUsd(metronome)}</span>
    </div>
  );
}

function StatusCell({ row }: { row: PokeUnifiedCreditRow }) {
  if (!row.internal && row.metronome) {
    return (
      <Chip color="warning" size="xs">
        Metronome only
      </Chip>
    );
  }
  if (row.internal && !row.metronome) {
    if (row.internal.metronomeCreditId === null) {
      return (
        <Chip color="primary" size="xs">
          DB only
        </Chip>
      );
    }
    return (
      <Chip color="warning" size="xs">
        Missing in Metronome
      </Chip>
    );
  }
  if (row.internal && row.metronome) {
    const initialMatch =
      Math.abs(
        row.internal.initialAmountMicroUsd - row.metronome.initialAmountMicroUsd
      ) < 10_000;
    const remainingMatch =
      Math.abs(
        row.internal.remainingAmountMicroUsd -
          row.metronome.remainingAmountMicroUsd
      ) < 10_000;
    if (!initialMatch || !remainingMatch) {
      return (
        <Chip color="warning" size="xs">
          Mismatch
        </Chip>
      );
    }
    return (
      <Chip color="green" size="xs">
        Matched
      </Chip>
    );
  }
  return null;
}

export function makeColumnsForUnifiedCredits({
  metronomeCustomerId,
}: {
  metronomeCustomerId: string | null;
}): ColumnDef<PokeUnifiedCreditRow>[] {
  return [
    {
      id: "id",
      accessorFn: (row) => row.internal?.id ?? row.metronome?.sId ?? "",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="ID" />
      ),
      cell: ({ row }) => {
        const dbId = row.original.internal?.id;
        const metronomeId = row.original.metronome?.sId;
        return (
          <div className="flex flex-col text-xs">
            {dbId !== undefined ? (
              <span>DB: {dbId}</span>
            ) : (
              <span className="text-gray-400">DB: —</span>
            )}
            {metronomeId ? (
              metronomeCustomerId ? (
                <LinkWrapper
                  href={getMetronomeCommitOrCreditUrl(
                    metronomeCustomerId,
                    metronomeId
                  )}
                  target="_blank"
                  className="font-mono text-highlight-400"
                >
                  M: {metronomeId.slice(0, 8)}…
                </LinkWrapper>
              ) : (
                <span className="font-mono">M: {metronomeId.slice(0, 8)}…</span>
              )
            ) : (
              <span className="text-gray-400">M: —</span>
            )}
          </div>
        );
      },
    },
    {
      id: "type",
      accessorFn: (row) => getRowType(row) ?? "",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Type" />
      ),
      cell: ({ row }) => {
        const type = getRowType(row.original);
        if (!type) {
          return null;
        }
        return (
          <Chip color={TYPE_COLORS[type] ?? "highlight"} size="xs">
            {type}
          </Chip>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusCell row={row.original} />,
    },
    {
      id: "initial",
      header: "Initial",
      cell: ({ row }) => (
        <AmountCell
          internal={pickInternal(row.original, (i) => i.initialAmountMicroUsd)}
          metronome={pickMetronome(
            row.original,
            (m) => m.initialAmountMicroUsd
          )}
        />
      ),
    },
    {
      id: "consumed",
      header: "Consumed",
      cell: ({ row }) => (
        <AmountCell
          internal={pickInternal(row.original, (i) => i.consumedAmountMicroUsd)}
          metronome={pickMetronome(
            row.original,
            (m) => m.consumedAmountMicroUsd
          )}
        />
      ),
    },
    {
      id: "remaining",
      header: "Remaining",
      cell: ({ row }) => (
        <AmountCell
          internal={pickInternal(
            row.original,
            (i) => i.remainingAmountMicroUsd
          )}
          metronome={pickMetronome(
            row.original,
            (m) => m.remainingAmountMicroUsd
          )}
        />
      ),
    },
    {
      id: "startDate",
      accessorFn: (row) => getRowStartDateMs(row) ?? 0,
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Start date" />
      ),
      cell: ({ row }) => {
        const ms = getRowStartDateMs(row.original);
        if (!ms) {
          return <span className="text-warning">Not started</span>;
        }
        return (
          <span className="text-sm">{dateToHumanReadable(new Date(ms))}</span>
        );
      },
    },
    {
      id: "expirationDate",
      accessorFn: (row) => getRowExpirationDateMs(row) ?? 0,
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Expiration" />
      ),
      cell: ({ row }) => {
        const ms = getRowExpirationDateMs(row.original);
        if (!ms) {
          return <span className="text-warning">No expiration</span>;
        }
        const expDate = new Date(ms);
        const isExpired = expDate < new Date();
        return (
          <span className={`text-sm ${isExpired ? "text-warning" : ""}`}>
            {dateToHumanReadable(expDate)}
            {isExpired && " (Expired)"}
          </span>
        );
      },
    },
    {
      id: "discount",
      accessorFn: (row) => row.internal?.discount ?? -1,
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Billed discount" />
      ),
      cell: ({ row }) => {
        const discount = row.original.internal?.discount ?? null;
        if (discount === null) {
          return <span className="text-gray-400">—</span>;
        }
        return <span>{discount}%</span>;
      },
    },
    {
      id: "createdAt",
      accessorFn: (row) =>
        row.internal ? new Date(row.internal.createdAt).getTime() : 0,
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Created" />
      ),
      cell: ({ row }) => {
        const createdAt = row.original.internal?.createdAt;
        if (!createdAt) {
          return <span className="text-gray-400">—</span>;
        }
        return (
          <span className="text-sm">
            {dateToHumanReadable(new Date(createdAt))}
          </span>
        );
      },
    },
  ];
}
