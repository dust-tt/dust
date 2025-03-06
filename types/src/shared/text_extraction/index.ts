//import { PassThrough, Transform } from "node:stream";

import { isLeft } from "fp-ts/Either";
import { Parser } from "htmlparser2";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { Readable } from "stream";

import { LoggerInterface } from "../logger";
import { Err, Ok, Result } from "../result";
import { withRetries } from "../retries";
import { assertNever } from "../utils/assert_never";
import {
  readableStreamToReadable,
  RequestInitWithDuplex,
} from "../utils/streams";
import { transformStream } from "./transform";
import { transformStreamToCSV } from "./transformToCSV";

// Define the codec for the response.
const TikaResponseCodec = t.type({
  "Content-Type": t.string,
  "X-TIKA:content": t.string,
});

// Define the type for the decoded response
type TikaResponse = t.TypeOf<typeof TikaResponseCodec>;

interface PageContent {
  pageNumber: number;
  content: string;
}

export const pagePrefixesPerMimeType: Record<string, string> = {
  "application/pdf": "$pdfPage",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "$slideNumber",
};

// All those content types are supported by the Tika server.
// Before adding a new content type, make sure to test it.
const supportedContentTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
] as const;

type SupportedContentTypes = (typeof supportedContentTypes)[number];

type ContentTypeConfig = {
  [key in SupportedContentTypes]?: {
    handler: "html" | "text";
    transformer: "document" | "csv";
    selector: string;
  };
};

const contentTypeConfig: ContentTypeConfig = {
  "application/pdf": {
    handler: "html",
    selector: "page",
    transformer: "document",
  },
  "application/vnd.ms-powerpoint": {
    handler: "html",
    selector: "slide-content",
    transformer: "document",
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    handler: "html",
    selector: "slide-content",
    transformer: "document",
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    handler: "html",
    selector: "h1",
    transformer: "csv",
  },
  "application/vnd.ms-excel": {
    handler: "html",
    selector: "h1",
    transformer: "csv",
  },
};

export function isTextExtractionSupportedContentType(
  contentType: string
): contentType is SupportedContentTypes {
  return supportedContentTypes.includes(contentType as SupportedContentTypes);
}

const DEFAULT_HANDLER = "text";
const DEFAULT_TIMEOUT_IN_MS = 60000;

export class TextExtraction {
  constructor(
    readonly url: string,
    readonly options: {
      enableOcr: boolean;
      logger: LoggerInterface;
    }
  ) {}

  getAdditionalHeaders(): HeadersInit {
    return {
      "X-Tika-PDFOcrStrategy": this.options.enableOcr ? "auto" : "no_ocr",
      "X-Tika-Timeout-Millis": DEFAULT_TIMEOUT_IN_MS.toString(),
    };
  }

  // Method to extract text from a buffer.
  async fromBuffer(
    fileBuffer: Buffer,
    contentType: SupportedContentTypes
  ): Promise<Result<PageContent[], Error>> {
    const response = await this.queryTika(fileBuffer, contentType);
    if (response.isErr()) {
      return response;
    }

    return this.processResponse(response.value);
  }

  // Method to extract text from a stream.
  async fromStream(
    fileStream: Readable,
    contentType: SupportedContentTypes
  ): Promise<Readable> {
    const response = await withRetries(
      this.options.logger,
      ({
        url,
        additionalHeaders,
        contentType,
        fileStream,
      }: {
        url: string;
        additionalHeaders: HeadersInit;
        contentType: SupportedContentTypes;
        fileStream: Readable;
      }) =>
        fetch(`${url}/tika/`, {
          method: "PUT",
          headers: {
            "Content-Type": contentType,
            ...additionalHeaders,
          },
          body: Readable.toWeb(fileStream),
          duplex: "half",
        } as RequestInitWithDuplex),
      {
        retries: 3,
        delayBetweenRetriesMs: 1000,
      }
    )({
      url: this.url,
      additionalHeaders: this.getAdditionalHeaders(),
      contentType,
      fileStream,
    });

    if (!response.body) {
      throw new Error("Response body is null");
    }

    const responseStream = readableStreamToReadable(response.body);

    const config = contentTypeConfig[contentType];

    if (config) {
      const { transformer, selector } = config;
      switch (transformer) {
        case "document": {
          const prefix = pagePrefixesPerMimeType[contentType];
          return transformStream(responseStream, prefix, selector);
        }
        case "csv": {
          return transformStreamToCSV(responseStream, selector);
        }
        default:
          assertNever(transformer);
      }
    }

    return responseStream;
  }

  // Query the Tika server and return the response data.
  private async queryTika(
    fileBuffer: Buffer,
    contentType: SupportedContentTypes
  ): Promise<Result<TikaResponse, Error>> {
    // Determine the handler type based on the content type.
    // The HTML handler preserves the structural information of the document
    // like page structure, etc. The text handler does not.
    const handlerType =
      contentTypeConfig[contentType]?.handler ?? DEFAULT_HANDLER;

    try {
      const response = await withRetries(
        this.options.logger,
        ({
          url,
          additionalHeaders,
          handlerType,
          contentType,
          fileBuffer,
        }: {
          url: string;
          additionalHeaders: HeadersInit;
          handlerType: string;
          contentType: SupportedContentTypes;
          fileBuffer: Buffer;
        }) =>
          fetch(`${url}/tika/${handlerType}`, {
            method: "PUT",
            headers: {
              Accept: "application/json",
              "Content-Type": contentType,
              ...additionalHeaders,
            },
            body: fileBuffer,
          }),
        {
          retries: 3,
          delayBetweenRetriesMs: 1000,
        }
      )({
        url: this.url,
        additionalHeaders: this.getAdditionalHeaders(),
        handlerType,
        contentType,
        fileBuffer,
      });

      if (!response.ok) {
        return new Err(new Error(`HTTP error status: ${response.status}`));
      }

      const data = await response.json();
      const decodedReponse = TikaResponseCodec.decode(data);
      if (isLeft(decodedReponse)) {
        const pathError = reporter.formatValidationErrors(decodedReponse.left);
        return new Err(new Error(`Invalid response format: ${pathError}`));
      }

      return new Ok(decodedReponse.right);
    } catch (err) {
      this.options.logger.error({ error: err }, "Error while extracting text");

      const errorMessage =
        err instanceof Error ? err.message : "Unexpected error";

      return new Err(new Error(`Failed extracting text: ${errorMessage}`));
    }
  }

  // Process the Tika response and return an array of PageContent.
  private processResponse(
    response: TikaResponse
  ): Promise<Result<PageContent[], Error>> {
    const contentType = response["Content-Type"];

    const pageSelector =
      contentTypeConfig[contentType as SupportedContentTypes]?.selector;
    if (pageSelector) {
      return this.processContentBySelector(response, pageSelector);
    }

    return this.processDefaultResponse(response);
  }

  // Generic function to process response using a page selector.
  private processContentBySelector(
    response: TikaResponse,
    contentSelector: string
  ): Promise<Result<PageContent[], Error>> {
    const html = response["X-TIKA:content"];

    const stream = Readable.from(html);

    // This logic extract the content of the page based on the selector.
    // We use a streaming parser to avoid loading the entire content in memory.
    return new Promise<Result<PageContent[], Error>>((resolve) => {
      const contentDivs: PageContent[] = [];
      let currentPageContent = "";
      let insidePage = false;
      let pageNumber = 0;
      let pageDepth = 0;

      const parser = new Parser(
        {
          onopentag(name, attribs) {
            // Check if the current tag is the page selector.
            // If it is, we are inside a page.
            // This assumes that we don't have nested pages.
            if (name === "div" && attribs.class === contentSelector) {
              insidePage = true;
              pageNumber++;
              currentPageContent = "";
              pageDepth = 1;
            } else if (insidePage) {
              // If we are inside a page, increment the page depth to handle nested divs.
              // This is required to know when we are done with the page.
              pageDepth++;
            }
          },
          ontext(text) {
            // If we are inside a page, append the text to the current page content.
            if (insidePage) {
              currentPageContent += text.trim() + " ";
            }
          },
          onclosetag() {
            // If we are inside a page, decrement the page depth.
            if (insidePage) {
              pageDepth--;
              // If the page depth is 0, we are done with the page.
              if (pageDepth === 0) {
                insidePage = false;
                if (currentPageContent.trim()) {
                  contentDivs.push({
                    pageNumber: pageNumber,
                    content: currentPageContent.trim(),
                  });
                }
                currentPageContent = "";
              }
            }
          },
          onerror(err) {
            return resolve(new Err(err));
          },
        },
        { decodeEntities: true }
      );

      stream.on("data", (chunk: Buffer) => {
        parser.write(chunk.toString());
      });

      stream.on("end", () => {
        parser.end();
        return resolve(new Ok(contentDivs));
      });

      stream.on("error", (err) => {
        return resolve(new Err(err));
      });
    });
  }

  // Process default response.
  private processDefaultResponse(
    response: TikaResponse
  ): Promise<Result<PageContent[], Error>> {
    const content = response["X-TIKA:content"];

    // Treat the entire content as a single page.
    return Promise.resolve(
      new Ok([{ pageNumber: 1, content: content.trim() }])
    );
  }
}
