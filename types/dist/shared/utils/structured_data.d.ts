import { Result } from "../result";
export declare class InvalidStructuredDataHeaderError extends Error {
}
export declare function getSanitizedHeaders(rawHeaders: string[]): Result<string[], Error>;
export declare function guessDelimiter(csv: string): Promise<string | undefined>;
export declare function parseAndStringifyCsv(tableCsv: string): Promise<string>;
//# sourceMappingURL=structured_data.d.ts.map