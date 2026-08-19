import { formatCredits } from "@app/lib/client/credits";
import type { GroupType } from "@app/types/groups";
import type { KeyType } from "@app/types/key";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { RoleType } from "@app/types/user";
import type { MenuItem } from "@dust-tt/sparkle";
import {
  Building07,
  Button,
  ChevronLeft,
  ChevronRight,
  Chip,
  DataTable,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Edit04,
  FilterFunnel01,
  Icon,
  SearchInput,
  Tooltip,
} from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { prettifyGroupName } from "./utils";

const API_KEYS_PAGE_SIZE = 10;

type APIKeyStatus = "active" | "capped" | "revoked";

interface APIKeysListProps {
  keys: KeyType[];
  groupsById: Record<ModelId, GroupType>;
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
  searchText: string;
  spaces: string[];
  scope: string;
  secret: string;
  status: APIKeyStatus;
  monthlyCap: string;
  menuItems: MenuItem[];
}

const getKeySpaces = (
  key: KeyType,
  groupsById: Record<ModelId, GroupType>
): string[] => {
  return key.groupIds
    .map((groupId) => groupsById[groupId])
    .filter((group): group is GroupType => group !== undefined)
    .map((group) => prettifyGroupName(group));
};

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
  return key.creditState === "capped" ? "capped" : "active";
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

function buildColumns({
  actionsDisabled,
  capLabel,
  onRevoke,
}: {
  actionsDisabled: boolean;
  capLabel: string;
  onRevoke: (key: KeyType) => Promise<void>;
}): ColumnDef<APIKeyRowData>[] {
  return [
    {
      id: "name",
      accessorFn: (row) => row.name,
      header: "Name",
      enableSorting: false,
      meta: { className: "h-16 w-56", headerAlign: "left" },
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
      meta: { className: "h-16 w-28", headerAlign: "left" },
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
      meta: { className: "h-16 w-40", headerAlign: "left" },
      cell: (info) => (
        <DataTable.BasicCellContent
          className="font-mono text-muted-foreground"
          label={info.row.original.secret}
        />
      ),
    },
    {
      id: "spaces",
      accessorFn: (row) => row.spaces.join(", "),
      header: "Spaces",
      enableSorting: false,
      meta: { className: "h-16 w-48", headerAlign: "left" },
      cell: (info) => {
        const spaces = info.row.original.spaces;
        const [firstSpace, ...remainingSpaces] = spaces;

        return (
          <div className="flex min-w-0 items-center gap-2">
            <Icon visual={Building07} size="sm" className="shrink-0" />
            <span className="min-w-0 truncate">
              {firstSpace ?? "No spaces"}
            </span>
            {remainingSpaces.length > 0 && (
              <Tooltip
                label={
                  <div className="flex flex-col">
                    {remainingSpaces.map((space, index) => (
                      <span key={`${space}-${index}`}>{space}</span>
                    ))}
                  </div>
                }
                tooltipTriggerAsChild
                trigger={
                  <span
                    className="shrink-0 rounded outline-hidden focus-visible:ring-2 focus-visible:ring-highlight-300"
                    tabIndex={0}
                    aria-label={`${remainingSpaces.length} more spaces`}
                  >
                    <Chip
                      size="mini"
                      color="primary"
                      label={`+${remainingSpaces.length}`}
                    />
                  </span>
                }
              />
            )}
          </div>
        );
      },
    },
    {
      id: "monthlyCap",
      accessorKey: "monthlyCap",
      header: capLabel,
      enableSorting: false,
      meta: { className: "h-16 w-32", headerAlign: "left" },
      cell: (info) => (
        <DataTable.BasicCellContent
          className="tabular-nums"
          label={info.row.original.monthlyCap}
        />
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      enableSorting: false,
      meta: { className: "h-16 w-28", headerAlign: "left" },
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
              label={
                status === "active"
                  ? "Active"
                  : status === "capped"
                    ? "Capped"
                    : "Revoked"
              }
            />
          </DataTable.CellContent>
        );
      },
    },
    {
      id: "revoke",
      header: "",
      enableSorting: false,
      meta: { className: "h-16 w-24", headerAlign: "right" },
      cell: (info) =>
        info.row.original.key.status === "active" ? (
          <DataTable.CellContent className="w-full justify-end">
            <Button
              label="Revoke"
              size="sm"
              variant="warning"
              disabled={actionsDisabled}
              onClick={() => void onRevoke(info.row.original.key)}
            />
          </DataTable.CellContent>
        ) : null,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      meta: { className: "h-16 w-12" },
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
}

export function APIKeysList({
  keys,
  groupsById,
  isRevoking,
  isGenerating,
  onRevoke,
  onEditCap,
  showLegacyUsdMonthlyCap,
  showCreditMonthlyCap,
}: APIKeysListProps) {
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

  const actionsDisabled = isRevoking || isGenerating;
  const rows = useMemo<APIKeyRowData[]>(
    () =>
      keys.map((key) => {
        const spaces = getKeySpaces(key, groupsById);
        const scope = formatKeyScope(key.role);
        const status = getKeyStatus(key);
        const creator = key.creator ?? "Unknown creator";
        const menuItems: MenuItem[] =
          key.status === "active" &&
          (showLegacyUsdMonthlyCap || showCreditMonthlyCap)
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
          searchText: [
            key.name,
            creator,
            key.secret,
            scope,
            status,
            ...spaces,
          ].join(" "),
          spaces,
          scope,
          secret: key.secret,
          status,
          monthlyCap: formatMonthlyCap({
            key,
            showLegacyUsdMonthlyCap,
            showCreditMonthlyCap,
          }),
          menuItems,
        };
      }),
    [groupsById, keys, onEditCap, showCreditMonthlyCap, showLegacyUsdMonthlyCap]
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
        onRevoke,
      }),
    [actionsDisabled, onRevoke, showCreditMonthlyCap]
  );
  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        row.searchText.toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        statusFilters.size === 0 || statusFilters.has(row.status);
      const matchesScope =
        scopeFilters.size === 0 || scopeFilters.has(row.scope);
      return matchesSearch && matchesStatus && matchesScope;
    });
  }, [rows, scopeFilters, search, statusFilters]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredRows.length / pagination.pageSize)
  );
  const pageIndex = Math.min(pagination.pageIndex, pageCount - 1);
  const paginatedRows = filteredRows.slice(
    pageIndex * pagination.pageSize,
    (pageIndex + 1) * pagination.pageSize
  );
  const appliedFilterCount = statusFilters.size + scopeFilters.size;

  const resetPagination = () => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  return (
    <div className="rounded-xl border border-border bg-panel-background p-4">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
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
                label={
                  status === "active"
                    ? "Active"
                    : status === "capped"
                      ? "Capped"
                      : "Revoked"
                }
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

      {keys.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Create an API key to start using Dust programmatically.
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No API keys match these filters.
        </div>
      ) : (
        <div className="dd-privacy-mask overflow-x-auto">
          <DataTable
            data={paginatedRows}
            columns={columns}
            className="min-w-[720px]"
            columnsBreakpoints={{
              key: "lg",
              spaces: "md",
              monthlyCap: "sm",
            }}
          />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm font-medium text-foreground">
          {filteredRows.length.toLocaleString()} API{" "}
          {filteredRows.length === 1 ? "key" : "keys"}
        </span>
        {filteredRows.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="mr-1 text-sm text-muted-foreground">
              Page {pageIndex + 1} of {pageCount}
            </span>
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
        )}
      </div>
    </div>
  );
}
