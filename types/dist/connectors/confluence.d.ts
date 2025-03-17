import { ModelId } from "../shared/model_id";
export declare function makeConfluenceSyncWorkflowId(connectorId: ModelId): string;
export declare class ConfluenceClientError extends Error {
    readonly type: "validation_error" | "http_response_error";
    readonly status?: number;
    readonly data?: object;
    constructor(message: string, error_data: ({
        type: "http_response_error";
        status: number;
    } | {
        type: "validation_error";
    }) & {
        data?: object;
    });
}
export declare function isConfluenceNotFoundError(err: unknown): err is ConfluenceClientError;
//# sourceMappingURL=confluence.d.ts.map