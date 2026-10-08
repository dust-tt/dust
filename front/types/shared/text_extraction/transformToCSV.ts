import { normalizeError } from "@app/types/shared/utils/error_utils";
import { stringify } from "csv-stringify/sync";
import { Parser } from "htmlparser2";
import type { Readable } from "stream";
import { Transform } from "stream";

import { MAX_FILE_SIZES, TABLE_PREFIX } from "../../files";

// Tika pads each row with empty cells up to the sheet's last used column, so a small but wide
// workbook can expand into gigabytes of CSV. Cap the output at the size accepted for a CSV upload.
const MAX_CSV_OUTPUT_BYTES = MAX_FILE_SIZES.delimited;

interface ParserState {
  tags: string[];
  currentRow: string[];
  insideCell: boolean;
  currentCellText: string;
}

const HTML_TAGS = {
  ROW: "tr",
  CELL: "td",
} as const;

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
/**
 * @cc [owner:philipperolet,label:performance;error-handling] bounded-csv-output
 * The returned stream MUST NOT emit more than `MAX_CSV_OUTPUT_BYTES` bytes. When the output would
 * exceed it, the stream MUST fail with an error whose message contains "could not be processed"
 * (mapped to `file_too_large` by `processAndStoreFile`), and `input` MUST be destroyed.
 */
export function transformStreamToCSV(
  input: Readable,
  selector: string
): Readable {
  // Track parser state.
  const state: ParserState = {
    tags: [],
    currentRow: [],
    insideCell: false,
    currentCellText: "",
  };

  let outputBytes = 0;
  const pushOutput = (text: string) => {
    outputBytes += Buffer.byteLength(text);
    if (outputBytes > MAX_CSV_OUTPUT_BYTES) {
      throw new Error(
        "The spreadsheet could not be processed: once converted, it is larger than " +
          `${MAX_CSV_OUTPUT_BYTES / 1024 / 1024} MB. ` +
          "Remove empty rows and columns, or split it into smaller files."
      );
    }
    htmlParsingTransform.push(text);
  };

  // Create a single parser instance for the entire stream.
  const parser = new Parser(
    {
      onopentag(name) {
        state.tags.push(name);
        if (name === HTML_TAGS.CELL) {
          state.insideCell = true;
          state.currentCellText = "";
        }
      },

      ontext(text) {
        const currentTag = state.tags[state.tags.length - 1];

        if (currentTag === selector) {
          pushOutput(`${TABLE_PREFIX}${text}\n`);
        } else if (state.insideCell) {
          state.currentCellText += text;
        }
      },

      onclosetag(name) {
        const lastTag = state.tags.pop();
        if (name !== lastTag) {
          throw new Error("Invalid tag order");
        } else {
          if (lastTag === HTML_TAGS.ROW) {
            pushOutput(stringify([state.currentRow]));
            state.currentRow = [];
          }
          if (lastTag === HTML_TAGS.CELL) {
            state.currentRow.push(state.currentCellText);
            state.insideCell = false;
          }
        }
      },

      onerror(err) {
        // If we encounter a parser error, destroy the transform with that error.
        htmlParsingTransform.destroy(err);
      },
    },
    { decodeEntities: true } // Instruct parser to decode HTML entities like &amp.
  );

  // Create transform stream.
  const htmlParsingTransform = new Transform({
    objectMode: true,

    transform(chunk: Buffer, _encoding, callback) {
      try {
        parser.write(chunk.toString());
        callback();
      } catch (error) {
        callback(normalizeError(error));
      }
    },

    flush(callback) {
      try {
        // Signal to the parser that we're done (end of the HTML input).
        parser.end();

        callback();
      } catch (error) {
        callback(normalizeError(error));
      }
    },
  });

  // Handle errors on both streams.
  input.on("error", (error) => htmlParsingTransform.destroy(error));
  htmlParsingTransform.on("error", (error) => input.destroy(error));

  // Pipe the input HTML stream through our transform and return the result
  return input.pipe(htmlParsingTransform);
}
