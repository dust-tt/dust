import * as cheerio from "cheerio";
import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

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

export class TextExtraction {
  constructor(readonly url: string) {}

  // Method to extract text from a buffer.
  async fromBuffer(
    fileBuffer: Buffer,
    contentType: string
  ): Promise<Result<PageContent[], Error>> {
    const response = await this.queryTika(fileBuffer, contentType);
    if (response.isErr()) {
      return response;
    }

    return new Ok(this.processResponse(response.value));
  }

  // Query the Tika server and return the response data.
  private async queryTika(
    fileBuffer: Buffer,
    contentType: string
  ): Promise<Result<TikaResponse, Error>> {
    // Determine the handler type based on the content type.
    // The HTML handler preserves the structural information of the document
    // like page structure, etc. The text handler does not.
    const handlerType = contentType === "application/pdf" ? "html" : "text";

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
        return new Err(new Error(`HTTP error! status: ${response.status}`));
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
  private processResponse(response: TikaResponse): PageContent[] {
    const contentType = response["Content-Type"];

    switch (contentType) {
      case "application/pdf":
        return this.processPdfResponse(response);

      default:
        return this.processDefaultResponse(response);
    }
  }

  // Process PDF response.
  private processPdfResponse(response: TikaResponse): PageContent[] {
    const html = response["X-TIKA:content"];

    const $ = cheerio.load(html);
    const slideContentDivs = $(".page");

    return slideContentDivs
      .map((index, div) => ({
        pageNumber: index + 1,
        content: $(div).text()?.trim() || "",
      }))
      .get();
  }

  // Process default response.
  private processDefaultResponse(response: TikaResponse): PageContent[] {
    const content = response["X-TIKA:content"];

    // Treat the entire content as a single page.
    return [{ pageNumber: 1, content: content.trim() }];
  }
}
