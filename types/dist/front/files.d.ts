export declare const TABLE_PREFIX = "TABLE:";
export type FileStatus = "created" | "failed" | "ready";
export type FileUseCase = "conversation" | "avatar" | "tool_output" | "upsert_document" | "upsert_table";
export type FileUseCaseMetadata = {
    conversationId: string;
    generatedTables?: string[];
};
export interface FileType {
    contentType: SupportedFileContentType;
    downloadUrl?: string;
    fileName: string;
    fileSize: number;
    sId: string;
    id: string;
    status: FileStatus;
    uploadUrl?: string;
    publicUrl?: string;
    useCase: FileUseCase;
}
export type FileTypeWithUploadUrl = FileType & {
    uploadUrl: string;
};
export type FileFormatCategory = "image" | "data" | "code" | "delimited";
export declare const MAX_FILE_SIZES: Record<FileFormatCategory, number>;
export declare function maxFileSizeToHumanReadable(size: number, decimals?: number): string;
export declare function isBigFileSize(size: number): boolean;
export declare function ensureFileSize(contentType: SupportedFileContentType, fileSize: number): boolean;
declare const FILE_FORMATS: {
    readonly "image/jpeg": {
        readonly cat: "image";
        readonly exts: [".jpg", ".jpeg"];
    };
    readonly "image/png": {
        readonly cat: "image";
        readonly exts: [".png"];
    };
    readonly "image/gif": {
        readonly cat: "image";
        readonly exts: [".gif"];
    };
    readonly "image/webp": {
        readonly cat: "image";
        readonly exts: [".webp"];
    };
    readonly "text/csv": {
        readonly cat: "delimited";
        readonly exts: [".csv"];
    };
    readonly "text/comma-separated-values": {
        readonly cat: "delimited";
        readonly exts: [".csv"];
    };
    readonly "text/tsv": {
        readonly cat: "delimited";
        readonly exts: [".tsv"];
    };
    readonly "text/tab-separated-values": {
        readonly cat: "delimited";
        readonly exts: [".tsv"];
    };
    readonly "application/vnd.ms-excel": {
        readonly cat: "delimited";
        readonly exts: [".xls"];
    };
    readonly "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
        readonly cat: "delimited";
        readonly exts: [".xlsx"];
    };
    readonly "application/vnd.dust.section.json": {
        readonly cat: "data";
        readonly exts: [".json"];
    };
    readonly "text/plain": {
        readonly cat: "data";
        readonly exts: [".txt", ".log", ".cfg", ".conf"];
    };
    readonly "text/markdown": {
        readonly cat: "data";
        readonly exts: [".md", ".markdown"];
    };
    readonly "text/vnd.dust.attachment.slack.thread": {
        readonly cat: "data";
        readonly exts: [".txt"];
    };
    readonly "text/calendar": {
        readonly cat: "data";
        readonly exts: [".ics"];
    };
    readonly "application/json": {
        readonly cat: "data";
        readonly exts: [".json"];
    };
    readonly "application/msword": {
        readonly cat: "data";
        readonly exts: [".doc", ".docx"];
    };
    readonly "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
        readonly cat: "data";
        readonly exts: [".doc", ".docx"];
    };
    readonly "application/vnd.ms-powerpoint": {
        readonly cat: "data";
        readonly exts: [".ppt", ".pptx"];
    };
    readonly "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
        readonly cat: "data";
        readonly exts: [".ppt", ".pptx"];
    };
    readonly "application/pdf": {
        readonly cat: "data";
        readonly exts: [".pdf"];
    };
    readonly "text/xml": {
        readonly cat: "data";
        readonly exts: [".xml"];
    };
    readonly "application/xml": {
        readonly cat: "data";
        readonly exts: [".xml"];
    };
    readonly "text/html": {
        readonly cat: "data";
        readonly exts: [".html", ".htm", ".xhtml", ".xhtml+xml"];
    };
    readonly "text/css": {
        readonly cat: "code";
        readonly exts: [".css"];
    };
    readonly "text/javascript": {
        readonly cat: "code";
        readonly exts: [".js", ".mjs", "*.jsx"];
    };
    readonly "text/typescript": {
        readonly cat: "code";
        readonly exts: [".ts", ".tsx"];
    };
    readonly "application/x-sh": {
        readonly cat: "code";
        readonly exts: [".sh"];
    };
    readonly "text/x-sh": {
        readonly cat: "code";
        readonly exts: [".sh"];
    };
    readonly "text/x-python": {
        readonly cat: "code";
        readonly exts: [".py"];
    };
    readonly "text/x-python-script": {
        readonly cat: "code";
        readonly exts: [".py"];
    };
    readonly "application/x-yaml": {
        readonly cat: "code";
        readonly exts: [".yaml", ".yml"];
    };
    readonly "text/yaml": {
        readonly cat: "code";
        readonly exts: [".yaml", ".yml"];
    };
    readonly "text/vnd.yaml": {
        readonly cat: "code";
        readonly exts: [".yaml", ".yml"];
    };
    readonly "text/x-c": {
        readonly cat: "code";
        readonly exts: [".c", ".cc", ".cpp", ".cxx", ".dic", ".h", ".hh"];
    };
    readonly "text/x-csharp": {
        readonly cat: "code";
        readonly exts: [".cs"];
    };
    readonly "text/x-java-source": {
        readonly cat: "code";
        readonly exts: [".java"];
    };
    readonly "text/x-php": {
        readonly cat: "code";
        readonly exts: [".php"];
    };
    readonly "text/x-ruby": {
        readonly cat: "code";
        readonly exts: [".rb"];
    };
    readonly "text/x-sql": {
        readonly cat: "code";
        readonly exts: [".sql"];
    };
    readonly "text/x-swift": {
        readonly cat: "code";
        readonly exts: [".swift"];
    };
    readonly "text/x-rust": {
        readonly cat: "code";
        readonly exts: [".rs"];
    };
    readonly "text/x-go": {
        readonly cat: "code";
        readonly exts: [".go"];
    };
    readonly "text/x-kotlin": {
        readonly cat: "code";
        readonly exts: [".kt", ".kts"];
    };
    readonly "text/x-scala": {
        readonly cat: "code";
        readonly exts: [".scala"];
    };
    readonly "text/x-groovy": {
        readonly cat: "code";
        readonly exts: [".groovy"];
    };
    readonly "text/x-perl": {
        readonly cat: "code";
        readonly exts: [".pl", ".pm"];
    };
    readonly "text/x-perl-script": {
        readonly cat: "code";
        readonly exts: [".pl", ".pm"];
    };
};
export type SupportedFileContentType = keyof typeof FILE_FORMATS;
export type SupportedImageContentType = {
    [K in keyof typeof FILE_FORMATS]: (typeof FILE_FORMATS)[K] extends {
        cat: "image";
    } ? K : never;
}[keyof typeof FILE_FORMATS];
export type SupportedDelimitedTextContentType = {
    [K in keyof typeof FILE_FORMATS]: (typeof FILE_FORMATS)[K] extends {
        cat: "delimited";
    } ? K : never;
}[keyof typeof FILE_FORMATS];
export type SupportedNonImageContentType = {
    [K in keyof typeof FILE_FORMATS]: (typeof FILE_FORMATS)[K] extends {
        cat: "image";
    } ? never : K;
}[keyof typeof FILE_FORMATS];
export declare const supportedUploadableContentType: string[];
export declare function isSupportedFileContentType(contentType: string): contentType is SupportedFileContentType;
export declare function isPublicySupportedUseCase(useCase: string): useCase is FileUseCase;
export declare function isSupportedImageContentType(contentType: string): contentType is SupportedImageContentType;
export declare function isSupportedDelimitedTextContentType(contentType: string): contentType is SupportedDelimitedTextContentType;
export declare function getFileFormatCategory(contentType: string): FileFormatCategory | null;
export declare function extensionsForContentType(contentType: SupportedFileContentType): string[];
export declare function contentTypeForExtension(extension: string): SupportedFileContentType | null;
export declare function getSupportedFileExtensions(cat?: FileFormatCategory | undefined): (".jpg" | ".jpeg" | ".png" | ".gif" | ".webp" | ".csv" | ".tsv" | ".xls" | ".xlsx" | ".json" | ".txt" | ".log" | ".cfg" | ".conf" | ".md" | ".markdown" | ".ics" | ".doc" | ".docx" | ".ppt" | ".pptx" | ".pdf" | ".xml" | ".html" | ".htm" | ".xhtml" | ".xhtml+xml" | ".css" | ".js" | ".mjs" | "*.jsx" | ".ts" | ".tsx" | ".sh" | ".py" | ".yaml" | ".yml" | ".c" | ".cc" | ".cpp" | ".cxx" | ".dic" | ".h" | ".hh" | ".cs" | ".java" | ".php" | ".rb" | ".sql" | ".swift" | ".rs" | ".go" | ".kt" | ".kts" | ".scala" | ".groovy" | ".pl" | ".pm")[];
export declare function getSupportedNonImageFileExtensions(): (".csv" | ".tsv" | ".xls" | ".xlsx" | ".json" | ".txt" | ".log" | ".cfg" | ".conf" | ".md" | ".markdown" | ".ics" | ".doc" | ".docx" | ".ppt" | ".pptx" | ".pdf" | ".xml" | ".html" | ".htm" | ".xhtml" | ".xhtml+xml" | ".css" | ".js" | ".mjs" | "*.jsx" | ".ts" | ".tsx" | ".sh" | ".py" | ".yaml" | ".yml" | ".c" | ".cc" | ".cpp" | ".cxx" | ".dic" | ".h" | ".hh" | ".cs" | ".java" | ".php" | ".rb" | ".sql" | ".swift" | ".rs" | ".go" | ".kt" | ".kts" | ".scala" | ".groovy" | ".pl" | ".pm")[];
export declare function getSupportedNonImageMimeTypes(): ("text/csv" | "text/comma-separated-values" | "text/tsv" | "text/tab-separated-values" | "application/vnd.ms-excel" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.dust.section.json" | "text/plain" | "text/markdown" | "text/vnd.dust.attachment.slack.thread" | "text/calendar" | "application/json" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/pdf" | "text/xml" | "application/xml" | "text/html" | "text/css" | "text/javascript" | "text/typescript" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script")[];
export {};
//# sourceMappingURL=files.d.ts.map