interface VisualizationRPCRequestBase {
    identifier: string;
    messageUniqueId: string;
}
interface GetFileParams {
    fileId: string;
}
interface SetContentHeightParams {
    height: number;
}
interface DownloadFileRequestParams {
    blob: Blob;
    filename?: string;
}
interface setErrorMessageParams {
    errorMessage: string;
}
export type VisualizationRPCRequestMap = {
    getFile: GetFileParams;
    getCodeToExecute: null;
    setContentHeight: SetContentHeightParams;
    setErrorMessage: setErrorMessageParams;
    downloadFileRequest: DownloadFileRequestParams;
    displayCode: null;
};
export type VisualizationRPCCommand = keyof VisualizationRPCRequestMap;
export type VisualizationRPCRequest = {
    [K in VisualizationRPCCommand]: VisualizationRPCRequestBase & {
        command: K;
        params: VisualizationRPCRequestMap[K];
    };
}[VisualizationRPCCommand];
export declare const validCommands: VisualizationRPCCommand[];
export interface CommandResultMap {
    getCodeToExecute: {
        code: string;
    };
    getFile: {
        fileBlob: Blob | null;
    };
    downloadFileRequest: {
        blob: Blob;
        filename?: string;
    };
    setContentHeight: void;
    setErrorMessage: void;
    displayCode: void;
}
export declare function isGetFileRequest(value: unknown): value is VisualizationRPCRequest & {
    command: "getFile";
    params: GetFileParams;
};
export declare function isGetCodeToExecuteRequest(value: unknown): value is VisualizationRPCRequest & {
    command: "getCodeToExecute";
    params: null;
};
export declare function isSetContentHeightRequest(value: unknown): value is VisualizationRPCRequest & {
    command: "setContentHeight";
    params: SetContentHeightParams;
};
export declare function isSetErrorMessageRequest(value: unknown): value is VisualizationRPCRequest & {
    command: "setErrorMessage";
};
export declare function isDownloadFileRequest(value: unknown): value is VisualizationRPCRequest & {
    command: "downloadFileRequest";
    params: DownloadFileRequestParams;
};
export declare function isDisplayCodeRequest(value: unknown): value is VisualizationRPCRequest & {
    command: "displayCode";
    params: null;
};
export declare function isVisualizationRPCRequest(value: unknown): value is VisualizationRPCRequest;
export {};
//# sourceMappingURL=visualization.d.ts.map