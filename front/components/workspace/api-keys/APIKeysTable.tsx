import { useConsumptionTop } from "@app/hooks/useConsumptionTop";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { formatCredits } from "@app/lib/client/credits";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import { timeAgoFrom } from "@app/lib/utils";
import type { ConsumptionScopeFilter } from "@app/types/api/analytics/consumption";
import { GLOBAL_SPACE_NAME } from "@app/types/groups";
import type { KeyType } from "@app/types/key";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { RoleType, WorkspaceType } from "@app/types/user";
import type { MenuItem } from "@dust-tt/sparkle";
import {
  Building04,
  Button,
  ChevronLeft,
  ChevronRight,
  Chip,
  DataTable,
  DataTableLoadingSkeleton,
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
  Separator,
  Tooltip,
  Trash01,
} from "@dust-tt/sparkle";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import capitalize from "lodash/capitalize";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

const API_KEYS_PAGE_SIZE = 10;
const MAX_API_KEY_CONSUMPTION_ROWS = 100;

type APIKeyStatus = "active" | "capped" | "revoked";

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
  monthlyCap: string;
  lastUsedAt: number | null;
  menuItems: MenuItem[];
}

const formatKeyScope = (role: RoleType): string => {
  switch (role) {
    case "user":
      return "Read-only";
    case "manager":
    case "builder":
      return "Read & write";
    case "admin":
      return "Admin";
    case "none":
      return "No access";
    default:
      assertNeverAndIgnore(role);
      return "Unknown";
  }
};

function getKeyStatus(key: KeyType): APIKeyStatus {
  if (key.status !== "active") {
    return "revoked";
  }
  return key.isSpendCapped ? "capped" : "active";
}

function formatMonthlyCap({
  key,
  showLegacyUsdMonthlyCap,
  showCreditMonthlyCap,
}: {
  key: KeyType;
  showLegacyUsdMonthlyCap: boolean;
  showCreditMonthlyCap: boolean;
}): string {
  if (showCreditMonthlyCap) {
    return key.monthlyCapAwuCredits === null
      ? "Unlimited"
      : formatCredits(key.monthlyCapAwuCredits);
  }
  if (showLegacyUsdMonthlyCap) {
    return key.monthlyCapMicroUsd === null
      ? "Unlimited"
      : `$${(key.monthlyCapMicroUsd / 1_000_000).toFixed(2)}`;
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

function buildColumns({
  actionsDisabled,
  capLabel,
  isConsumptionLoading,
  onRevoke,
  showAnalyticsConsumption,
}: {
  actionsDisabled: boolean;
  capLabel: string;
  isConsumptionLoading: boolean;
  onRevoke: (key: KeyType) => Promise<void>;
  showAnalyticsConsumption: boolean;
}): ColumnDef<APIKeyRowData>[] {
  const columns: ColumnDef<APIKeyRowData>[] = [
    {
      id: "name",
      accessorFn: (row) => row.name,
      header: "Name",
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
      header: "Scope",
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
            color={info.row.original.scope === "Admin" ? "warning" : "primary"}
            label={info.row.original.scope}
          />
        </DataTable.CellContent>
      ),
    },
    {
      id: "key",
      accessorKey: "secret",
      header: "Key",
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
      header: "Spaces",
      enableSorting: false,
      meta: {
        className: showAnalyticsConsumption
          ? "hidden h-16 w-12 @lg-table:table-cell"
          : "hidden h-16 w-12 @md-table:table-cell",
        headerAlign: "left",
      },
      cell: (info) => {
        const spaces = info.row.original.spaces;
        const spaceLabels = spaces.length > 0 ? spaces : ["No spaces"];
        const spaceIcon = info.row.original.hasPrivateSpace
          ? Lock01
          : Building04;

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
                  aria-label={`Spaces: ${spaceLabels.join(", ")}`}
                >
                  <Icon visual={spaceIcon} size="sm" />
                </span>
              }
            />
          </DataTable.CellContent>
        );
      },
    },
    {
      id: "credits",
      accessorKey: "credits",
      header: "Credits",
      enableSorting: false,
      meta: { className: "h-16 w-32", headerAlign: "left" },
      cell: (info) => {
        const { credits, monthlyCap } = info.row.original;
        return (
          <ConsumptionCell isLoading={isConsumptionLoading} align="left">
            <DataTable.BasicCellContent
              className="justify-start text-left tabular-nums"
              label={`${
                credits === null ? "—" : formatCredits(credits)
              }/${monthlyCap === "Unlimited" ? "unlimited" : monthlyCap}`}
            />
          </ConsumptionCell>
        );
      },
    },
    {
      id: "monthlyCap",
      accessorKey: "monthlyCap",
      header: capLabel,
      enableSorting: false,
      meta: {
        className: showAnalyticsConsumption
          ? "hidden h-16 w-24 @md-table:table-cell"
          : "hidden h-16 w-28 @md-table:table-cell",
        headerAlign: "left",
      },
      cell: (info) => (
        <DataTable.BasicCellContent
          className="tabular-nums"
          label={info.row.original.monthlyCap}
        />
      ),
    },
    {
      id: "lastUsedAt",
      accessorKey: "lastUsedAt",
      header: "Last used",
      enableSorting: true,
      meta: {
        className: showAnalyticsConsumption
          ? "hidden h-16 w-24 px-1 @sm-table:table-cell"
          : "hidden h-16 w-30 @sm-table:table-cell",
        headerAlign: "left",
      },
      cell: (info) => (
        <DataTable.BasicCellContent
          className="whitespace-nowrap"
          label={
            info.row.original.lastUsedAt
              ? `${timeAgoFrom(info.row.original.lastUsedAt, {
                  useLongFormat: true,
                })} ago`
              : "Never"
          }
        />
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      enableSorting: false,
      meta: {
        className: showAnalyticsConsumption ? "h-16 w-16 px-1" : "h-16 w-18",
        headerAlign: "left",
      },
      cell: (info) => {
        const status = info.row.original.status;
        return (
          <DataTable.CellContent>
            <Chip
              size="xs"
              color={
                status === "active"
                  ? "success"
                  : status === "capped"
                    ? "warning"
                    : "primary"
              }
              label={capitalize(status)}
            />
          </DataTable.CellContent>
        );
      },
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
                tooltip="Revoke API key"
                size="sm"
                variant="warning"
                disabled={actionsDisabled}
                onClick={() => void onRevoke(info.row.original.key)}
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
        // Every key reaches the global space, but `key.spaces` only echoes the spaces it was
        // scoped to. The label is added here, as `NewAPIKeyDialog` does with its fixed chip.
        const spaces = [
          GLOBAL_SPACE_NAME,
          ...key.spaces.map((space) => space.name),
        ];
        const scope = formatKeyScope(key.role);
        const status = getKeyStatus(key);
        const creator = key.creator ?? "Unknown creator";
        const consumption = consumptionByName.get(key.name);
        const isConsumptionKnown =
          showAnalyticsConsumption &&
          (consumption !== undefined ||
            (!hasMoreConsumptionRows && !consumptionError));
        const credits = consumption?.credits ?? (isConsumptionKnown ? 0 : null);
        const menuItems: MenuItem[] =
          key.status === "active"
            ? [
                {
                  kind: "item",
                  label: "Edit monthly cap",
                  icon: Edit04,
                  onClick: () => onEditCap(key),
                },
              ]
            : [];

        return {
          key,
          name: key.name || "Unnamed",
          creator,
          spaces,
          hasPrivateSpace: key.spaces.some((space) =>
            restrictedSpaceIds.has(space.sId)
          ),
          scope,
          secret: key.secret,
          status,
          credits,
          monthlyCap: formatMonthlyCap({
            key,
            showLegacyUsdMonthlyCap,
            showCreditMonthlyCap,
          }),
          lastUsedAt: key.lastUsedAt,
          menuItems,
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
    ]
  );

  const scopeOptions = useMemo(
    () => [...new Set(rows.map((row) => row.scope))].sort(),
    [rows]
  );
  const columns = useMemo(
    () =>
      buildColumns({
        actionsDisabled,
        capLabel: showCreditMonthlyCap ? "Credits cap" : "Monthly cap",
        isConsumptionLoading,
        onRevoke,
        showAnalyticsConsumption,
      }),
    [
      actionsDisabled,
      isConsumptionLoading,
      onRevoke,
      showAnalyticsConsumption,
      showCreditMonthlyCap,
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
          comparison = left.name.localeCompare(right.name);
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
  const appliedFilterCount = statusFilters.size + scopeFilters.size;

  const resetPagination = () => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  return (
    <div
      className="flex flex-col gap-4 rounded-xl border border-border bg-panel-background p-4"
      aria-busy={isLoading || isSpacesLoading}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          name="api-keys-search"
          placeholder="Search API Key"
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
              label="Filters"
              size="sm"
              variant="outline"
              isCounter={appliedFilterCount > 0}
              counterValue={String(appliedFilterCount)}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel label="Status" />
            {(["active", "capped", "revoked"] as const).map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                label={capitalize(status)}
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
            <DropdownMenuLabel label="Scope" />
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
          <DataTableLoadingSkeleton
            className="pt-4"
            showSelectionColumn={false}
            showTrailingCell
          />
          <Separator />
          <div className="flex items-center justify-between">
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
          Failed to load API keys.
        </div>
      ) : (
        <>
          {keys.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Create an API key to start using Dust programmatically.
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No API keys match these filters.
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
              {filteredRows.length.toLocaleString()} API key
              {pluralize(filteredRows.length)}
            </span>
            {filteredRows.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  Page {pageIndex + 1} of {pageCount}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    icon={ChevronLeft}
                    aria-label="Previous page"
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
                    aria-label="Next page"
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
