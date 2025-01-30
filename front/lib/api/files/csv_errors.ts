export type CsvErrorCode = "CSV_INVALID_CLOSING_QUOTE";

export interface CsvError {
  code: string;
  message?: string;
}

const CSV_ERROR_MESSAGES: Record<CsvErrorCode, string> = {
  CSV_INVALID_CLOSING_QUOTE:
    "Invalid quote in CSV file. Make sure all quoted fields are properly closed.",
};

export function isCsvError(err: unknown): err is CsvError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    (err as { code: string }).code.startsWith("CSV_")
  );
}

export function getCsvErrorMessage(err: CsvError): string {
  return (
    CSV_ERROR_MESSAGES[err.code as CsvErrorCode] ??
    `Invalid CSV format (${err.code})`
  );
}
