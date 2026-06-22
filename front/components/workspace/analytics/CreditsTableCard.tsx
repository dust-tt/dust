import { DataTable, SearchInput, Spinner } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

// Minimal row shape DataTable accepts (its optional row-interaction fields).
type CreditsTableRow = {
  onClick?: () => void;
  onDoubleClick?: () => void;
};

function CreditsTableMessage({ children }: { children: string }) {
  return (
    <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
      {children}
    </div>
  );
}

interface CreditsTableBodyProps<T extends CreditsTableRow> {
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  emptyMessage: string;
  columns: ColumnDef<T>[];
  data: T[];
}

function CreditsTableBody<T extends CreditsTableRow>({
  isLoading,
  isError,
  errorMessage,
  emptyMessage,
  columns,
  data,
}: CreditsTableBodyProps<T>) {
  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (isError) {
    return <CreditsTableMessage>{errorMessage}</CreditsTableMessage>;
  }
  if (data.length === 0) {
    return <CreditsTableMessage>{emptyMessage}</CreditsTableMessage>;
  }
  return (
    <div className="max-h-[44rem] overflow-y-auto [&_tbody_tr:last-child]:border-b-0">
      <DataTable<T> data={data} columns={columns} />
    </div>
  );
}

interface CreditsTableCardProps<T extends CreditsTableRow> {
  title: string;
  description: string;
  searchName: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  emptyMessage: string;
  columns: ColumnDef<T>[];
  data: T[];
}

export function CreditsTableCard<T extends CreditsTableRow>({
  title,
  description,
  searchName,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  isLoading,
  isError,
  errorMessage,
  emptyMessage,
  columns,
  data,
}: CreditsTableCardProps<T>) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 dark:border-border-night">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-medium text-foreground dark:text-foreground-night">
            {title}
          </h3>
          <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            {description}
          </p>
        </div>
        <SearchInput
          name={searchName}
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={onSearchChange}
          className="w-64"
        />
      </div>
      <CreditsTableBody
        isLoading={isLoading}
        isError={isError}
        errorMessage={errorMessage}
        emptyMessage={emptyMessage}
        columns={columns}
        data={data}
      />
    </div>
  );
}
