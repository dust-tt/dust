import type {
  DatabaseTableEntry,
  LiveDatabaseEntry,
} from "@app/types/api/sandbox/pod_databases";
import {
  Database01,
  FolderTable,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  Spinner,
} from "@dust-tt/sparkle";

interface PodDatabasesSidebarProps {
  databases: LiveDatabaseEntry[];
  activeDatabase: string | null;
  activeTable: string | null;
  tables: DatabaseTableEntry[];
  isTablesLoading: boolean;
  onSelectDatabase: (database: string) => void;
  onSelectTable: (table: string) => void;
}

const BYTES_PER_KB = 1024;

function formatSizeBytes(sizeBytes: number): string {
  if (sizeBytes < BYTES_PER_KB) {
    return `${sizeBytes} B`;
  }
  const sizeKb = sizeBytes / BYTES_PER_KB;
  return sizeKb < BYTES_PER_KB
    ? `${Math.round(sizeKb)} KB`
    : `${(sizeKb / BYTES_PER_KB).toFixed(1)} MB`;
}

/**
 * Databases, and the tables of the selected one. Built on the same navigation list the Pods
 * sidebar uses, so a selected row reads the same way here as it does there.
 */
export function PodDatabasesSidebar({
  databases,
  activeDatabase,
  activeTable,
  tables,
  isTablesLoading,
  onSelectDatabase,
  onSelectTable,
}: PodDatabasesSidebarProps) {
  return (
    <NavigationList className="w-64 shrink-0 border-r border-separator pr-2">
      <NavigationListLabel label="Databases" />
      {databases.map((database) => {
        const isActive = database.name === activeDatabase;
        return (
          <div key={database.name} className="flex flex-col gap-0.5">
            <NavigationListItem
              icon={Database01}
              label={database.name}
              selected={isActive}
              onClick={() => onSelectDatabase(database.name)}
              suffix={
                <span className="text-xs text-muted-foreground">
                  {formatSizeBytes(database.sizeBytes)}
                </span>
              }
            />

            {isActive && (
              <div className="flex flex-col gap-0.5 pl-4">
                {isTablesLoading ? (
                  <div className="px-2 py-2">
                    <Spinner size="xs" />
                  </div>
                ) : (
                  <>
                    {tables.map((table) => (
                      <NavigationListItem
                        key={table.name}
                        icon={FolderTable}
                        label={table.name}
                        selected={table.name === activeTable}
                        count={table.rowCount}
                        onClick={() => onSelectTable(table.name)}
                      />
                    ))}
                    {tables.length === 0 && (
                      <div className="px-2 py-1 text-sm text-muted-foreground">
                        No tables
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </NavigationList>
  );
}
