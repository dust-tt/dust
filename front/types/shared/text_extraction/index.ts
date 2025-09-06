//import { PassThrough, Transform } from "node:stream";

import { Readable } from "stream";

import type { LoggerInterface } from "../logger";
import { assertNever } from "../utils/assert_never";
import type { RequestInitWithDuplex } from "../utils/streams";
import { readableStreamToReadable } from "../utils/streams";
import { transformStream } from "./transform";
import { transformStreamToCSV } from "./transformToCSV";

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

const DEFAULT_TIMEOUT_IN_MS = 300000;

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

  // Method to extract text from a stream.
  async fromStream(
    fileStream: Readable,
    contentType: SupportedContentTypes
  ): Promise<Readable> {
    const response = await fetch(`${this.url}/tika/`, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        ...this.getAdditionalHeaders(),
      },
      body: Readable.toWeb(fileStream),
      duplex: "half",
    } as RequestInitWithDuplex);

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
}
