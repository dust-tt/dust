import { isLeft } from "fp-ts/Either";
import { Parser } from "htmlparser2";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { Readable } from "stream";

import { Err, Ok, Result } from "./result";

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

// All those content types are supported by the Tika server.
// Before adding a new content type, make sure to test it.
const supportedContentTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

type SupportedContentTypes = (typeof supportedContentTypes)[number];

type ContentTypeConfig = {
  [key in SupportedContentTypes]?: {
    handler: "html" | "text";
    pageSelector?: string;
  };
};

const contentTypeConfig: ContentTypeConfig = {
  "application/pdf": { handler: "html", pageSelector: "page" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    handler: "html",
    pageSelector: "slide-content",
  },
};
const DEFAULT_HANDLER = "text";

export class TextExtraction {
  constructor(readonly url: string) {}

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
      const response = await fetch(`${this.url}/tika/${handlerType}`, {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": contentType,
        },
        body: fileBuffer,
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
      contentTypeConfig[contentType as SupportedContentTypes]?.pageSelector;
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

export function isTextExtractionSupportedContentType(
  contentType: string
): contentType is SupportedContentTypes {
  return supportedContentTypes.includes(contentType as SupportedContentTypes);
}
