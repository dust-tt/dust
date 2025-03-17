/// <reference types="node" />
/// <reference types="node" />
import { Readable } from "stream";
import { LoggerInterface } from "../logger";
import { Result } from "../result";
interface PageContent {
    pageNumber: number;
    content: string;
}
export declare const pagePrefixesPerMimeType: Record<string, string>;
declare const supportedContentTypes: readonly ["application/pdf", "application/msword", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
type SupportedContentTypes = (typeof supportedContentTypes)[number];
export declare function isTextExtractionSupportedContentType(contentType: string): contentType is SupportedContentTypes;
export declare class TextExtraction {
    readonly url: string;
    readonly options: {
        enableOcr: boolean;
        logger: LoggerInterface;
    };
    constructor(url: string, options: {
        enableOcr: boolean;
        logger: LoggerInterface;
    });
    getAdditionalHeaders(): HeadersInit;
    fromBuffer(fileBuffer: Buffer, contentType: SupportedContentTypes): Promise<Result<PageContent[], Error>>;
    fromStream(fileStream: Readable, contentType: SupportedContentTypes): Promise<Readable>;
    private queryTika;
    private processResponse;
    private processContentBySelector;
    private processDefaultResponse;
}
export {};
//# sourceMappingURL=index.d.ts.map