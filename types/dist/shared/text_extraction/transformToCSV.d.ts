/// <reference types="node" />
import { Readable } from "stream";
/**
 * A Transform stream that processes HTML data from a Readable stream, extracts text from tables
 * and converts it to CSV format. It handles two specific cases:
 * 1. Text within elements matching the selector, which gets prefixed with TABLE_PREFIX
 * 2. Content within table cells (<td>), which gets converted to CSV format
 *
 * @param input - A Node.js Readable stream containing HTML
 * @param selector - A tag name to match for direct text extraction (prefixed with TABLE_PREFIX)
 * @returns A new Readable stream that emits the processed text in CSV format
 *
 * How it works:
 * 1. We create a single HTML parser (Parser) instance that listens to events:
 *    - onopentag: Tracks the current tag stack
 *    - ontext:
 *      * If inside selector-matched element: adds text with TABLE_PREFIX
 *      * If inside <td>: collects text for current row
 *    - onclosetag: When a </tr> is encountered, converts the collected row to CSV
 *    - onerror: Destroys the transform if a parsing error occurs
 *
 * 2. We wrap this parser in a Node Transform stream to:
 *    - pipe HTML input into it
 *    - process data chunks through the parser
 *    - handle proper stream cleanup in flush
 */
export declare function transformStreamToCSV(input: Readable, selector: string): Readable;
//# sourceMappingURL=transformToCSV.d.ts.map