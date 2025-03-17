/// <reference types="node" />
import { Readable } from "stream";
export declare function createPageMetadataPrefix({ pageNumber, prefix, }: {
    pageNumber: number;
    prefix: string;
}): string;
/**
 * A Transform stream that processes HTML data from a Readable stream, extracts text from specific
 * "page" <div> elements (identified by a known CSS class), and prefixes each extracted page's text
 * with some custom metadata. Each complete page is pushed downstream as it is encountered.
 *
 * @param input - A Node.js Readable stream containing HTML
 * @param prefix - A prefix string included in the page metadata
 * @param pageSelector - The CSS class on <div> that identifies a page boundary
 * @returns A new Readable stream that emits text for each page, prefixed by metadata
 *
 * How it works:
 * 1. We create a single HTML parser (Parser) instance that listens to events:
 *    - onopentag: Detects when we enter a <div class="pageSelector"> (or nested)
 *    - ontext: Accumulates text if we are currently inside a page div
 *    - onclosetag: Detects when we leave a page div; if that ends the page div,
 *      we emit the stored text plus metadata
 *    - onerror: Destroys the transform if a parsing error occurs
 *
 * 2. We wrap this parser in a Node Transform stream so we can:
 *    - pipe HTML input into it (input.pipe(htmlParsingTransform))
 *    - feed data chunks into the parser
 *    - flush final content in _flush if the stream ends while still inside a page
 *
 * 3. Each completed page is emitted downstream in text form with a custom prefix block
 */
export declare function transformStream(input: Readable, prefix: string, pageSelector: string): Readable;
//# sourceMappingURL=transform.d.ts.map