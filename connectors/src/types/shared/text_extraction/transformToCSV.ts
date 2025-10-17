import { stringify } from "csv-stringify/sync";
import { Parser } from "htmlparser2";
import type { Readable } from "stream";
import { Transform } from "stream";

// TODO: Magic string copied from front/files.ts, find a way to share this
const TABLE_PREFIX = "TABLE:";

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
          htmlParsingTransform.push(`${TABLE_PREFIX}${text}\n`);
        } else if (currentTag === HTML_TAGS.CELL) {
          state.currentCellText += text;
        }
      },

      onclosetag(name) {
        const lastTag = state.tags.pop();
        if (name !== lastTag) {
          throw new Error("Invalid tag order");
        } else {
          if (lastTag === HTML_TAGS.ROW) {
            const csv = stringify([state.currentRow]);
            htmlParsingTransform.push(csv);
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
        if (error instanceof Error) {
          callback(error);
        } else {
          callback(
            new Error(
              typeof error === "string"
                ? error
                : "Unknown error in htmlParsingTransform.transform()"
            )
          );
        }
      }
    },

    flush(callback) {
      try {
        // Signal to the parser that we're done (end of the HTML input).
        parser.end();

        callback();
      } catch (error) {
        if (error instanceof Error) {
          callback(error);
        } else {
          callback(
            new Error(
              typeof error === "string"
                ? error
                : "Unknown error in htmlParsingTransform.flush()"
            )
          );
        }
      }
    },
  });

  // Handle errors on both streams.
  input.on("error", (error) => htmlParsingTransform.destroy(error));
  htmlParsingTransform.on("error", (error) => input.destroy(error));

  // Pipe the input HTML stream through our transform and return the result
  return input.pipe(htmlParsingTransform);
}
