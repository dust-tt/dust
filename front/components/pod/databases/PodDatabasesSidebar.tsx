import type {
  DatabaseTableEntry,
  LiveDatabaseEntry,
} from "@app/lib/api/sandbox_functions/dsbx_db";
import { classNames } from "@app/lib/utils";
import {
  Button,
  ChevronDown,
  ChevronRight,
  Database01,
  FolderTable,
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
  onShowSchema: (database: string) => void;
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

export function PodDatabasesSidebar({
  databases,
  activeDatabase,
  activeTable,
  tables,
  isTablesLoading,
  onSelectDatabase,
  onSelectTable,
  onShowSchema,
}: PodDatabasesSidebarProps) {
  return (
    <div className="flex w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r border-separator pr-2">
      {databases.map((database) => {
        const isActive = database.name === activeDatabase;
        return (
          <div key={database.name} className="flex flex-col">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelectDatabase(database.name)}
                className={classNames(
                  "flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                  "hover:bg-structure-100 dark:hover:bg-structure-100-night",
                  isActive ? "font-medium" : ""
                )}
              >
                {isActive ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <Database01 className="h-4 w-4 shrink-0" />
                <span className="truncate">{database.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {formatSizeBytes(database.sizeBytes)}
                </span>
              </button>
            </div>

            {isActive && (
              <div className="flex flex-col gap-0.5 pb-2 pl-6">
                {isTablesLoading ? (
                  <div className="px-2 py-2">
                    <Spinner size="xs" />
                  </div>
                ) : (
                  <>
                    {tables.map((table) => (
                      <button
                        key={table.name}
                        type="button"
                        onClick={() => onSelectTable(table.name)}
                        className={classNames(
                          "flex items-center gap-2 rounded-lg px-2 py-1 text-left text-sm",
                          "hover:bg-structure-100 dark:hover:bg-structure-100-night",
                          table.name === activeTable
                            ? "bg-structure-100 font-medium dark:bg-structure-100-night"
                            : ""
                        )}
                      >
                        <FolderTable className="h-4 w-4 shrink-0" />
                        <span className="truncate">{table.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {table.rowCount.toLocaleString()}
                        </span>
                      </button>
                    ))}
                    {tables.length === 0 && (
                      <div className="px-2 py-1 text-sm text-muted-foreground">
                        No tables
                      </div>
                    )}
                    <div className="pt-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        label="View schema"
                        onClick={() => onShowSchema(database.name)}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
