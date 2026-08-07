import { PodDatabaseRowsTable } from "@app/components/pod/databases/PodDatabaseRowsTable";
import { PodDatabaseSchemaSheet } from "@app/components/pod/databases/PodDatabaseSchemaSheet";
import { PodDatabasesSidebar } from "@app/components/pod/databases/PodDatabasesSidebar";
import { PodSqlConsole } from "@app/components/pod/databases/PodSqlConsole";
import {
  usePodDatabases,
  usePodDatabaseTables,
  usePodTableRows,
} from "@app/lib/swr/pod_databases";
import { MAX_TABLE_ROWS_PAGE_SIZE } from "@app/types/api/sandbox/pod_databases";
import type { PodType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import { ContentMessage, Database01, Spinner } from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import { useState } from "react";

interface PodDatabasesTabProps {
  owner: WorkspaceType;
  pod: PodType;
}

const INITIAL_PAGINATION: PaginationState = {
  pageIndex: 0,
  pageSize: MAX_TABLE_ROWS_PAGE_SIZE,
};

/**
 * Browse and query the pod's SQLite databases. Every pane here runs a command inside the pod
 * sandbox, so opening this tab wakes (or cold starts) it.
 */
export function PodDatabasesTab({ owner, pod }: PodDatabasesTabProps) {
  // `null` means "no explicit pick yet" — the first database and its first table are used until
  // the user selects something, so no effect is needed to seed the selection.
  const [selection, setSelection] = useState<{
    database: string | null;
    table: string | null;
  }>({ database: null, table: null });
  const [pagination, setPagination] =
    useState<PaginationState>(INITIAL_PAGINATION);
  const [schemaDatabase, setSchemaDatabase] = useState<string | null>(null);

  const { databases, isPodDatabasesLoading, podDatabasesError } =
    usePodDatabases({ owner, podId: pod.sId });

  const activeDatabase = selection.database ?? databases[0]?.name ?? null;

  const {
    tables,
    isPodDatabaseTablesLoading,
    podDatabaseTablesError,
    mutatePodDatabaseTables,
  } = usePodDatabaseTables({
    owner,
    podId: pod.sId,
    database: activeDatabase,
  });

  const activeTable = selection.table ?? tables[0]?.name ?? null;
  const activeTableRowCount = tables.find(
    (table) => table.name === activeTable
  )?.rowCount;

  const {
    columns,
    rows,
    isPodTableRowsLoading,
    podTableRowsError,
    mutatePodTableRows,
  } = usePodTableRows({
    owner,
    podId: pod.sId,
    database: activeDatabase,
    table: activeTable,
    limit: pagination.pageSize,
    offset: pagination.pageIndex * pagination.pageSize,
  });

  const onSelectDatabase = (database: string) => {
    setSelection({ database, table: null });
    setPagination(INITIAL_PAGINATION);
  };

  const onSelectTable = (table: string) => {
    setSelection({ database: activeDatabase, table });
    setPagination(INITIAL_PAGINATION);
  };

  const onDataChanged = () => {
    void mutatePodTableRows();
    void mutatePodDatabaseTables();
  };

  if (isPodDatabasesLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-3">
        <Spinner />
        <span className="text-sm text-muted-foreground">
          Starting the pod sandbox…
        </span>
      </div>
    );
  }

  if (podDatabasesError) {
    return (
      <div className="px-6 py-8">
        <ContentMessage variant="warning" title="Could not list the databases">
          {podDatabasesError}
        </ContentMessage>
      </div>
    );
  }

  if (databases.length === 0) {
    return (
      <div className="px-6 py-8">
        <ContentMessage
          variant="info"
          icon={Database01}
          title="No databases yet"
        >
          This pod has no databases. They are created by the pod's functions,
          from a schema file under <code>databases/</code>.
        </ContentMessage>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 gap-4 overflow-hidden px-6 py-8">
      <PodDatabasesSidebar
        databases={databases}
        activeDatabase={activeDatabase}
        activeTable={activeTable}
        tables={tables}
        isTablesLoading={isPodDatabaseTablesLoading}
        onSelectDatabase={onSelectDatabase}
        onSelectTable={onSelectTable}
        onShowSchema={setSchemaDatabase}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
          {podDatabaseTablesError && (
            <ContentMessage variant="warning" title="Could not list tables">
              {podDatabaseTablesError}
            </ContentMessage>
          )}

          {activeTable === null ? (
            <div className="text-sm text-muted-foreground">
              This database has no tables yet.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{`${activeDatabase} › ${activeTable}`}</span>
                {activeTableRowCount !== undefined && (
                  <span className="text-muted-foreground">
                    {`${activeTableRowCount.toLocaleString()} rows`}
                  </span>
                )}
                {isPodTableRowsLoading && <Spinner size="xs" />}
              </div>
              {podTableRowsError && (
                <ContentMessage variant="warning" title="Could not read rows">
                  {podTableRowsError}
                </ContentMessage>
              )}
              <PodDatabaseRowsTable
                columns={columns}
                rows={rows}
                totalRowCount={activeTableRowCount}
                pagination={pagination}
                setPagination={setPagination}
              />
            </>
          )}
        </div>

        {activeDatabase !== null && (
          <PodSqlConsole
            owner={owner}
            podId={pod.sId}
            database={activeDatabase}
            onDataChanged={onDataChanged}
          />
        )}
      </div>

      <PodDatabaseSchemaSheet
        owner={owner}
        podId={pod.sId}
        database={schemaDatabase}
        onClose={() => setSchemaDatabase(null)}
      />
    </div>
  );
}
