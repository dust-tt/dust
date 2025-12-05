import { Parser } from "htmlparser2";
import type { Readable } from "stream";
import { Transform } from "stream";

interface ParserState {
  insidePage: boolean;
  pageDepth: number;
  pageNumber: number;
  currentPageBuffer: string;
}

function createPageMetadataPrefix({
  pageNumber,
  prefix,
}: {
  pageNumber: number;
  prefix: string;
}): string {
  return `${prefix}: ${pageNumber}`;
}

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
export function transformStream(
  input: Readable,
  prefix: string,
  pageSelector: string
): Readable {
  // Track parser state.
  const state: ParserState = {
    insidePage: false,
    pageDepth: 0,
    pageNumber: 0,
    currentPageBuffer: "",
  };

  // Create a single parser instance for the entire stream.
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        // If this open tag is <div class="pageSelector">, we've encountered a new page.
        // We'll track nested divs in case they exist inside the page container.
        if (name === "div" && attribs.class === pageSelector) {
          if (!state.insidePage) {
            state.insidePage = true;
            state.pageDepth = 1;
          } else {
            state.pageDepth++;
          }
        } else if (state.insidePage) {
          // If we're already inside a page, any new tag increases the nesting depth.
          state.pageDepth++;
        }
      },

      ontext(text) {
        // If in the page region, accumulate the text, removing or replacing artifacts
        if (state.insidePage) {
          // Replaces &#13; (carriage return) with nothing, and trims the text.
          // Append a space to keep some spacing between tokens
          state.currentPageBuffer += text.replace("&#13;", "").trim() + " ";
        }
      },

      onclosetag() {
        // If we're inside a page, decrement the nesting depth each time a tag closes.
        if (state.insidePage) {
          state.pageDepth--;

          // If pageDepth==0, we've closed the outermost page div => a page is complete.
          if (state.pageDepth === 0) {
            state.insidePage = false;

            // If there's any text in the buffer, emit it as a new chunk prefixed with metadata.
            if (state.currentPageBuffer.trim()) {
              htmlParsingTransform.push(
                `\n${createPageMetadataPrefix({
                  pageNumber: state.pageNumber,
                  prefix,
                })}\n${state.currentPageBuffer.trim()}\n`
              );
            }

            // Reset for next page.
            state.pageNumber++;
            state.currentPageBuffer = "";
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

        // If we ended the stream while still inside a page, emit any leftover text.
        if (state.insidePage && state.currentPageBuffer.trim()) {
          this.push(
            `\n${createPageMetadataPrefix({
              pageNumber: state.pageNumber,
              prefix,
            })}\n${state.currentPageBuffer.trim()}\n`
          );
        }

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
