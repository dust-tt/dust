export type CsvErrorCode =
  | 'CSV_INVALID_CLOSING_QUOTE'
  | 'CSV_INCONSISTENT_RECORD_LENGTH'
  | 'CSV_QUOTE_NOT_CLOSED'
  | 'CSV_RECORD_INCONSISTENT_FIELDS_LENGTH'
  | 'CSV_RECORD_INCONSISTENT_COLUMNS';

export interface CsvError {
  code: string;
  message?: string;
}

const CSV_ERROR_MESSAGES: Record<CsvErrorCode, string> = {
  CSV_INVALID_CLOSING_QUOTE: 'Invalid quote in CSV file. Make sure all quoted fields are properly closed.',
  CSV_INCONSISTENT_RECORD_LENGTH: 'Inconsistent number of columns in CSV file.',
  CSV_QUOTE_NOT_CLOSED: 'Unclosed quote in CSV file.',
  CSV_RECORD_INCONSISTENT_FIELDS_LENGTH: 'Inconsistent number of fields across rows.',
  CSV_RECORD_INCONSISTENT_COLUMNS: 'Inconsistent column structure.',
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
  return CSV_ERROR_MESSAGES[err.code as CsvErrorCode] ??
    `Invalid CSV format (${err.code})`;
}