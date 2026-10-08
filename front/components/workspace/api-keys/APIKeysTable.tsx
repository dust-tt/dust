import { APIKeyDetailsSheet } from "@app/components/workspace/api-keys/APIKeyDetailsSheet";
import type { APIKeyStatus } from "@app/components/workspace/api-keys/utils";
import {
  API_KEY_STATUS_CHIP_COLORS,
  API_KEY_STATUS_LABELS,
  getKeyScopeLabel,
  getKeyStatus,
} from "@app/components/workspace/api-keys/utils";
import { useConsumptionTop } from "@app/hooks/useConsumptionTop";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { formatCredits } from "@app/lib/client/credits";
import { timeAgoFrom } from "@app/lib/client/relative_time";
import { compareStrings, formatCurrency } from "@app/lib/i18n/format";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import type { ConsumptionScopeFilter } from "@app/types/api/analytics/consumption";
import type { KeyType } from "@app/types/key";
import type { ModelId } from "@app/types/shared/model_id";
import type { WorkspaceType } from "@app/types/user";
import type { DataTableSkeletonCellProps, MenuItem } from "@dust-tt/sparkle";
import {
  Building04,
  Button,
  ChevronLeft,
  ChevronRight,
  Chip,
  cn,
  DataTable,
  DataTableSkeleton,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Edit04,
  FilterFunnel01,
  Icon,
  LoadingBlock,
  Lock01,
  SearchInput,
  Tooltip,
  Trash01,
} from "@dust-tt/sparkle";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

const API_KEYS_PAGE_SIZE = 10;
const MAX_API_KEY_CONSUMPTION_ROWS = 100;

function APIKeySkeletonCell({
  columnId,
  rowIndex,
}: DataTableSkeletonCellProps) {
  switch (columnId) {
    case "name":
      return (
        <div className="flex flex-col justify-center">
          <div className="flex h-5 items-center">
            <LoadingBlock
              className={cn(
                "h-3 max-w-full",
                ["w-24", "w-28", "w-20", "w-32", "w-24"][rowIndex % 5]
              )}
            />
          </div>
          <div className="flex h-4 items-center">
            <LoadingBlock
              className={cn(
                "h-2.5 max-w-full",
                ["w-20", "w-16", "w-24", "w-20", "w-28"][rowIndex % 5]
              )}
            />
          </div>
        </div>
      );
    case "scope":
      return <LoadingBlock className="h-6 w-16 max-w-full rounded-[9px]" />;
    case "key":
      return <LoadingBlock className="h-3 w-24 max-w-full" />;
    case "spaces":
      return <LoadingBlock className="mx-auto h-5 w-5" />;
    case "credits":
      return <LoadingBlock className="h-3 w-24 max-w-full" />;
    case "monthlyCap":
      return <LoadingBlock className="h-3 w-16 max-w-full" />;
    case "lastUsedAt":
      return <LoadingBlock className="h-3 w-16 max-w-full" />;
    case "status":
      return <LoadingBlock className="h-6 w-14 max-w-full rounded-[9px]" />;
    case "revoke":
      return (
        <LoadingBlock className="ml-auto h-8 w-8 rounded-xl pointer-fine:invisible" />
      );
    case "actions":
      return <LoadingBlock className="ml-auto h-8 w-8 rounded-xl" />;
    default:
      return null;
  }
}

interface APIKeysTableProps {
  keys: KeyType[];
  workspaceId: WorkspaceType["sId"];
  period: ConsumptionPeriodSelection;
  isLoading: boolean;
  isError: boolean;
  showAnalyticsConsumption: boolean;
  isRevoking: boolean;
  isGenerating: boolean;
  onRevoke: (key: KeyType) => Promise<void>;
  onEditCap: (key: KeyType) => void;
  showLegacyUsdMonthlyCap: boolean;
  showCreditMonthlyCap: boolean;
}

interface APIKeyRowData {
  key: KeyType;
  name: string;
  creator: string;
  spaces: string[];
  hasPrivateSpace: boolean;
  scope: string;
  secret: string;
  status: APIKeyStatus;
  credits: number | null;
  monthlyCap: string | null;
  monthlyCapTooltip: string | null;
  lastUsedAt: number | null;
  menuItems: MenuItem[];
  onClick: () => void;
}

function formatMicroUsd(microUsd: number): string {
  return formatCurrency(microUsd / 1_000_000, "USD");
}

function formatLegacyUsage(key: KeyType): { used: string; cap: string } | null {
  if (key.monthlyCapMicroUsd === null || key.monthlyUsageMicroUsd === null) {
    return null;
  }
  return {
    used: formatMicroUsd(key.monthlyUsageMicroUsd),
    cap: formatMicroUsd(key.monthlyCapMicroUsd),
  };
}

function formatMonthlyCap({
  key,
  showLegacyUsdMonthlyCap,
  showCreditMonthlyCap,
}: {
  key: KeyType;
  showLegacyUsdMonthlyCap: boolean;
  showCreditMonthlyCap: boolean;
}): string | null {
  if (showCreditMonthlyCap) {
    return key.monthlyCapAwuCredits === null
      ? null
      : formatCredits(key.monthlyCapAwuCredits);
  }
  if (showLegacyUsdMonthlyCap) {
    return key.monthlyCapMicroUsd === null
      ? null
      : formatMicroUsd(key.monthlyCapMicroUsd);
  }
  return "—";
}

function toggleSetValue<T>(current: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(current);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function matchesAPIKeySearch(row: APIKeyRowData, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return [
    row.name,
    row.creator,
    row.secret,
    row.scope,
    row.status,
    ...row.spaces,
  ].some((value) => value.toLowerCase().includes(normalizedSearch));
}

interface ConsumptionCellProps {
  isLoading: boolean;
  children: ReactNode;
  align?: "left" | "right";
}

function ConsumptionCell({
  isLoading,
  children,
  align = "right",
}: ConsumptionCellProps) {
  if (isLoading) {
    return (
      <DataTable.CellContent
        className={
          align === "right" ? "w-full justify-end" : "w-full justify-start"
        }
      >
        <LoadingBlock className="h-3 w-16" />
      </DataTable.CellContent>
    );
  }

  return <>{children}</>;
}

interface SpacesCellProps {
  spaces: string[];
  hasPrivateSpace: boolean;
}

function SpacesCell({ spaces, hasPrivateSpace }: SpacesCellProps) {
  const { t } = useLingui();
  const spaceLabels = spaces.length > 0 ? spaces : [t`No spaces`];
  const spaceList = spaceLabels.join(", ");
  const spaceIcon = hasPrivateSpace ? Lock01 : Building04;

  return (
    <DataTable.CellContent className="w-full justify-center">
      <Tooltip
        label={
          <div className="flex flex-col">
            {spaceLabels.map((space, index) => (
              <span key={`${space}-${index}`}>{space}</span>
            ))}
          </div>
        }
        tooltipTriggerAsChild
        trigger={
          <span
            className="inline-flex shrink-0 rounded outline-hidden focus-visible:ring-2 focus-visible:ring-highlight-300"
            tabIndex={0}
            aria-label={t`Spaces: ${spaceList}`}
          >
            <Icon visual={spaceIcon} size="sm" />
          </span>
        }
      />
    </DataTable.CellContent>
  );
}

interface CreditsCellContentProps {
  credits: number | null;
  monthlyCap: string | null;
}

function CreditsCellContent({ credits, monthlyCap }: CreditsCellContentProps) {
  const { t } = useLingui();
  const creditsLabel = credits === null ? "—" : formatCredits(credits);

  return (
    <DataTable.BasicCellContent
      className="justify-start text-left tabular-nums"
      label={
        monthlyCap === null
          ? t`${creditsLabel}/unlimited`
          : `${creditsLabel}/${monthlyCap}`
      }
    />
  );
}

interface MonthlyCapCellProps {
  monthlyCap: string | null;
  tooltip: string | null;
}

function MonthlyCapCell({ monthlyCap, tooltip }: MonthlyCapCellProps) {
  const { t } = useLingui();

  return (
    <DataTable.BasicCellContent
      className="tabular-nums"
      label={monthlyCap ?? t`Unlimited`}
      tooltip={tooltip ?? undefined}
    />
  );
}

interface LastUsedCellProps {
  lastUsedAt: number | null;
}

function LastUsedCell({ lastUsedAt }: LastUsedCellProps) {
  const { t } = useLingui();

  return (
    <DataTable.BasicCellContent
      className="whitespace-nowrap"
      label={
        lastUsedAt
          ? timeAgoFrom(lastUsedAt, {
              useLongFormat: true,
            })
          : t`Never`
      }
    />
  );
}

interface StatusCellProps {
  status: APIKeyStatus;
}

function StatusCell({ status }: StatusCellProps) {
  const { t } = useLingui();

  return (
    <DataTable.CellContent>
      <Chip
        size="xs"
        color={API_KEY_STATUS_CHIP_COLORS[status]}
        label={t(API_KEY_STATUS_LABELS[status])}
      />
    </DataTable.CellContent>
  );
}

function buildColumns({
  actionsDisabled,
  labels,
  isConsumptionLoading,
  onRevoke,
  showAnalyticsConsumption,
}: {
  actionsDisabled: boolean;
  labels: {
    name: string;
    scope: string;
    key: string;
    spaces: string;
    credits: string;
    monthlyCap: string;
    lastUsed: string;
    status: string;
    revoke: string;
  };
  isConsumptionLoading: boolean;
  onRevoke: (key: KeyType) => Promise<void>;
  showAnalyticsConsumption: boolean;
}): ColumnDef<APIKeyRowData>[] {
  const columns: ColumnDef<APIKeyRowData>[] = [
    {
      id: "name",
      accessorFn: (row) => row.name,
      header: labels.name,
      enableSorting: true,
      meta: {
        className: showAnalyticsConsumption ? "h-16 w-40" : "h-16 w-44",
        headerAlign: "left",
      },
      cell: (info) => (
        <div className="flex flex-col justify-center">
          <span className="truncate text-sm font-medium text-foreground">
            {info.row.original.name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {info.row.original.creator}
          </span>
        </div>
      ),
    },
    {
      id: "scope",
      accessorKey: "scope",
      header: labels.scope,
      enableSorting: false,
      meta: {
        className: showAnalyticsConsumption
          ? "hidden h-16 w-20 px-1 @md-table:table-cell"
          : "hidden h-16 w-20 @lg-table:table-cell",
        headerAlign: "left",
      },
      cell: (info) => (
        <DataTable.CellContent>
          <Chip
            size="xs"
            color={
              info.row.original.key.role === "admin" ? "warning" : "primary"
            }
            label={info.row.original.scope}
          />
        </DataTable.CellContent>
      ),
    },
    {
      id: "key",
      accessorKey: "secret",
      header: labels.key,
      enableSorting: false,
      meta: {
        className: showAnalyticsConsumption
          ? "hidden h-16 w-28 @lg-table:table-cell"
          : "hidden h-16 w-32 @lg-table:table-cell",
        headerAlign: "left",
      },
      cell: (info) => {
        const secret = info.row.original.secret;
        const suffix = secret.slice(-4);

        return (
          <div className="flex w-full min-w-0 items-center font-mono text-sm text-muted-foreground">
            <span className="min-w-0 truncate">{secret.slice(0, -4)}</span>
            <span className="shrink-0">{suffix}</span>
          </div>
        );
      },
    },
    {
      id: "spaces",
      accessorFn: (row) => row.spaces.join(", "),
      header: labels.spaces,
      enableSorting: false,
      meta: {
        className: showAnalyticsConsumption
          ? "hidden h-16 w-12 @lg-table:table-cell"
          : "hidden h-16 w-12 @md-table:table-cell",
        headerAlign: "left",
      },
      cell: (info) => (
        <SpacesCell
          spaces={info.row.original.spaces}
          hasPrivateSpace={info.row.original.hasPrivateSpace}
        />
      ),
    },
    {
      id: "credits",
      accessorKey: "credits",
      header: labels.credits,
      enableSorting: true,
      meta: { className: "h-16 w-32", headerAlign: "left" },
      cell: (info) => {
        const { credits, monthlyCap } = info.row.original;
        return (
          <ConsumptionCell isLoading={isConsumptionLoading} align="left">
            <CreditsCellContent credits={credits} monthlyCap={monthlyCap} />
          </ConsumptionCell>
        );
      },
    },
    {
      id: "monthlyCap",
      accessorKey: "monthlyCap",
      header: labels.monthlyCap,
      enableSorting: false,
      meta: {
        className: showAnalyticsConsumption
          ? "hidden h-16 w-24 @md-table:table-cell"
          : "hidden h-16 w-28 @md-table:table-cell",
        headerAlign: "left",
      },
      cell: (info) => (
        <MonthlyCapCell
          monthlyCap={info.row.original.monthlyCap}
          tooltip={info.row.original.monthlyCapTooltip}
        />
      ),
    },
    {
      id: "lastUsedAt",
      accessorKey: "lastUsedAt",
      header: labels.lastUsed,
      enableSorting: true,
      meta: {
        className: showAnalyticsConsumption
          ? "hidden h-16 w-24 px-1 @sm-table:table-cell"
          : "hidden h-16 w-30 @sm-table:table-cell",
        headerAlign: "left",
      },
      cell: (info) => (
        <LastUsedCell lastUsedAt={info.row.original.lastUsedAt} />
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: labels.status,
      enableSorting: false,
      meta: {
        className: showAnalyticsConsumption ? "h-16 w-16 px-1" : "h-16 w-18",
        headerAlign: "left",
      },
      cell: (info) => <StatusCell status={info.row.original.status} />,
    },
    {
      id: "revoke",
      header: "",
      enableSorting: false,
      meta: {
        className: "hidden h-16 w-10 px-1 @xs-table:table-cell",
        headerAlign: "right",
      },
      cell: (info) =>
        info.row.original.key.status === "active" ? (
          <DataTable.CellContent className="w-full justify-end">
            <div className="transition-opacity duration-150 ease-out motion-reduce:transition-none pointer-fine:opacity-0 pointer-fine:group-hover/dt-row:opacity-100 pointer-fine:focus-within:opacity-100">
              <Button
                icon={Trash01}
                tooltip={labels.revoke}
                size="sm"
                variant="warning"
                disabled={actionsDisabled}
                onClick={(event) => {
                  // The row opens the key details on click.
                  event.stopPropagation();
                  void onRevoke(info.row.original.key);
                }}
              />
            </div>
          </DataTable.CellContent>
        ) : null,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      meta: {
        className: showAnalyticsConsumption ? "h-16 w-12" : "h-16 w-10",
      },
      cell: (info) =>
        info.row.original.menuItems.length > 0 ? (
          <DataTable.CellContent className="w-full justify-end">
            <DataTable.MoreButton
              menuItems={info.row.original.menuItems}
              disabled={actionsDisabled}
            />
          </DataTable.CellContent>
        ) : null,
    },
  ];

  if (showAnalyticsConsumption) {
    return columns.filter((column) => column.id !== "monthlyCap");
  }

  return columns.filter((column) => column.id !== "credits");
}

export function APIKeysTable({
  keys,
  workspaceId,
  period,
  isLoading,
  isError,
  showAnalyticsConsumption,
  isRevoking,
  isGenerating,
  onRevoke,
  onEditCap,
  showLegacyUsdMonthlyCap,
  showCreditMonthlyCap,
}: APIKeysTableProps) {
  const { t } = useLingui();
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<ReadonlySet<APIKeyStatus>>(
    new Set()
  );
  const [scopeFilters, setScopeFilters] = useState<ReadonlySet<string>>(
    new Set()
  );
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: API_KEYS_PAGE_SIZE,
  });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [detailsKeyModelId, setDetailsKeyModelId] = useState<ModelId | null>(
    null
  );

  const { spaces: workspaceSpaces, isSpacesLoading } = useSpacesAsAdmin({
    workspaceId,
  });
  const restrictedSpaceIds = useMemo(
    () =>
      new Set(
        workspaceSpaces
          .filter((space) => space.isRestricted)
          .map((space) => space.sId)
      ),
    [workspaceSpaces]
  );
  const apiKeyNames = useMemo(
    () => [...new Set(keys.map((key) => key.name))].sort(),
    [keys]
  );
  const consumptionFilter = useMemo<ConsumptionScopeFilter | undefined>(
    () => (apiKeyNames.length > 0 ? { api_keys: apiKeyNames } : undefined),
    [apiKeyNames]
  );
  const {
    rows: consumptionRows,
    hasMore: hasMoreConsumptionRows,
    isTopLoading: isConsumptionLoading,
    isTopError: consumptionError,
  } = useConsumptionTop({
    workspaceId,
    dimension: "api_key",
    period,
    limit: Math.max(
      1,
      Math.min(apiKeyNames.length, MAX_API_KEY_CONSUMPTION_ROWS)
    ),
    filter: consumptionFilter,
    disabled: !showAnalyticsConsumption || apiKeyNames.length === 0,
  });
  const consumptionByName = useMemo(
    () => new Map(consumptionRows.map((row) => [row.name, row])),
    [consumptionRows]
  );
  const actionsDisabled = isRevoking || isGenerating;
  const rows = useMemo<APIKeyRowData[]>(
    () =>
      keys.map((key) => {
        // Only the spaces the key was scoped to (read and write); the open spaces every key
        // reads through the workspace global group are not listed.
        const spaces = key.spaces.map((space) => space.name);
        const scope = t(getKeyScopeLabel(key.role));
        const status = getKeyStatus(key);
        const creator = key.creator ?? t`Unknown creator`;
        const consumption = consumptionByName.get(key.name);
        const isConsumptionKnown =
          showAnalyticsConsumption &&
          (consumption !== undefined ||
            (!hasMoreConsumptionRows && !consumptionError));
        const credits = consumption?.credits ?? (isConsumptionKnown ? 0 : null);
        let monthlyCap = formatMonthlyCap({
          key,
          showLegacyUsdMonthlyCap,
          showCreditMonthlyCap,
        });
        let monthlyCapTooltip: string | null = null;
        const legacyUsage = showLegacyUsdMonthlyCap
          ? formatLegacyUsage(key)
          : null;
        if (legacyUsage) {
          const { used, cap } = legacyUsage;
          monthlyCap = `${used} / ${cap}`;
          monthlyCapTooltip = t`${used} used of ${cap} over the last 30 days`;
        }
        const menuItems: MenuItem[] =
          key.status === "active"
            ? [
                {
                  kind: "item",
                  label: t`Edit monthly cap`,
                  icon: Edit04,
                  onClick: () => onEditCap(key),
                },
              ]
            : [];

        return {
          key,
          name: key.name || t`Unnamed`,
          creator,
          spaces,
          hasPrivateSpace: key.spaces.some((space) =>
            restrictedSpaceIds.has(space.sId)
          ),
          scope,
          secret: key.secret,
          status,
          credits,
          monthlyCap,
          monthlyCapTooltip,
          lastUsedAt: key.lastUsedAt,
          menuItems,
          onClick: () => setDetailsKeyModelId(key.id),
        };
      }),
    [
      consumptionByName,
      consumptionError,
      hasMoreConsumptionRows,
      keys,
      onEditCap,
      restrictedSpaceIds,
      showAnalyticsConsumption,
      showCreditMonthlyCap,
      showLegacyUsdMonthlyCap,
      t,
    ]
  );

  const detailsRow =
    rows.find((row) => row.key.id === detailsKeyModelId) ?? null;
  const monthlyCapLabel = showCreditMonthlyCap
    ? t`Credits cap`
    : t`Monthly cap`;

  const scopeOptions = useMemo(
    () => [...new Set(rows.map((row) => row.scope))].sort(),
    [rows]
  );
  const columns = useMemo(
    () =>
      buildColumns({
        actionsDisabled,
        labels: {
          name: t`Name`,
          scope: t`Scope`,
          key: t`Key`,
          spaces: t`Spaces`,
          credits: t`Credits`,
          monthlyCap: monthlyCapLabel,
          lastUsed: t`Last used`,
          status: t`Status`,
          revoke: t`Revoke API key`,
        },
        isConsumptionLoading,
        onRevoke,
        showAnalyticsConsumption,
      }),
    [
      actionsDisabled,
      isConsumptionLoading,
      onRevoke,
      monthlyCapLabel,
      showAnalyticsConsumption,
      t,
    ]
  );
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesSearch = matchesAPIKeySearch(row, search);
      const matchesStatus =
        statusFilters.size === 0 || statusFilters.has(row.status);
      const matchesScope =
        scopeFilters.size === 0 || scopeFilters.has(row.scope);
      return matchesSearch && matchesStatus && matchesScope;
    });
  }, [rows, scopeFilters, search, statusFilters]);
  const sortedRows = useMemo(() => {
    const activeSort = sorting[0];
    if (!activeSort) {
      return filteredRows;
    }

    return [...filteredRows].sort((left, right) => {
      let comparison = 0;
      switch (activeSort.id) {
        case "name":
          comparison = compareStrings(left.name, right.name);
          break;
        case "credits":
          if (left.credits === null || right.credits === null) {
            return left.credits === right.credits
              ? 0
              : left.credits === null
                ? 1
                : -1;
          }
          comparison = left.credits - right.credits;
          break;
        case "lastUsedAt":
          comparison = (left.lastUsedAt ?? 0) - (right.lastUsedAt ?? 0);
          break;
      }
      return activeSort.desc ? -comparison : comparison;
    });
  }, [filteredRows, sorting]);

  const pageCount = Math.max(
    1,
    Math.ceil(sortedRows.length / pagination.pageSize)
  );
  const pageIndex = Math.min(pagination.pageIndex, pageCount - 1);
  const paginatedRows = sortedRows.slice(
    pageIndex * pagination.pageSize,
    (pageIndex + 1) * pagination.pageSize
  );
  const pageNumber = pageIndex + 1;
  const filteredKeyCount = filteredRows.length;
  const appliedFilterCount = statusFilters.size + scopeFilters.size;

  const resetPagination = () => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  return (
    <div
      className="flex flex-col gap-4 rounded-xl border border-border bg-panel-background p-4"
      aria-busy={isLoading || isSpacesLoading}
    >
      <APIKeyDetailsSheet
        apiKey={detailsRow?.key ?? null}
        onClose={() => setDetailsKeyModelId(null)}
        monthlyCap={detailsRow?.monthlyCap ?? null}
        monthlyCapLabel={monthlyCapLabel}
        credits={detailsRow?.credits ?? null}
        isCreditsLoading={isConsumptionLoading}
        showAnalyticsConsumption={showAnalyticsConsumption}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          name="api-keys-search"
          placeholder={t`Search API Key`}
          value={search}
          onChange={(value) => {
            setSearch(value);
            resetPagination();
          }}
          className="dd-privacy-mask flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              icon={FilterFunnel01}
              label={t`Filters`}
              size="sm"
              variant="outline"
              isCounter={appliedFilterCount > 0}
              counterValue={String(appliedFilterCount)}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel label={t`Status`} />
            {(["active", "capped", "revoked"] as const).map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                label={t(API_KEY_STATUS_LABELS[status])}
                checked={statusFilters.has(status)}
                onCheckedChange={() => {
                  setStatusFilters((current) =>
                    toggleSetValue(current, status)
                  );
                  resetPagination();
                }}
                onSelect={(event) => event.preventDefault()}
              />
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel label={t`Scope`} />
            {scopeOptions.map((scope) => (
              <DropdownMenuCheckboxItem
                key={scope}
                label={scope}
                checked={scopeFilters.has(scope)}
                onCheckedChange={() => {
                  setScopeFilters((current) => toggleSetValue(current, scope));
                  resetPagination();
                }}
                onSelect={(event) => event.preventDefault()}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isLoading || isSpacesLoading ? (
        <>
          <DataTableSkeleton
            columns={columns}
            SkeletonCell={APIKeySkeletonCell}
            rowHeight={64}
          />
          <div aria-hidden="true" className="flex items-center justify-between">
            <LoadingBlock className="h-4 w-20" />
            <div className="flex items-center gap-3">
              <LoadingBlock className="h-4 w-24" />
              <div className="flex items-center gap-2">
                <LoadingBlock className="h-8 w-8 rounded-xl" />
                <LoadingBlock className="h-8 w-8 rounded-xl" />
              </div>
            </div>
          </div>
        </>
      ) : isError ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Trans>Failed to load API keys.</Trans>
        </div>
      ) : (
        <>
          {keys.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Trans>
                Create an API key to start using Dust programmatically.
              </Trans>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Trans>No API keys match these filters.</Trans>
            </div>
          ) : (
            <div className="dd-privacy-mask">
              <DataTable
                data={paginatedRows}
                columns={columns}
                sorting={sorting}
                setSorting={(nextSorting) => {
                  setSorting(nextSorting);
                  resetPagination();
                }}
                isServerSideSorting
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              <Plural
                value={filteredKeyCount}
                one="# API key"
                other="# API keys"
              />
            </span>
            {filteredRows.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  <Trans>
                    Page {pageNumber} of {pageCount}
                  </Trans>
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    icon={ChevronLeft}
                    aria-label={t`Previous page`}
                    size="sm"
                    variant="outline"
                    disabled={pageIndex === 0}
                    onClick={() =>
                      setPagination((current) => ({
                        ...current,
                        pageIndex: Math.max(0, pageIndex - 1),
                      }))
                    }
                  />
                  <Button
                    icon={ChevronRight}
                    aria-label={t`Next page`}
                    size="sm"
                    variant="outline"
                    disabled={pageIndex >= pageCount - 1}
                    onClick={() =>
                      setPagination((current) => ({
                        ...current,
                        pageIndex: Math.min(pageCount - 1, pageIndex + 1),
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
