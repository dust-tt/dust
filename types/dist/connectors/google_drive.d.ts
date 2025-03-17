import { ModelId } from "../shared/model_id";
export declare function getGoogleSheetTableId(googleFileId: string, googleSheetId: number): string;
export declare function getGoogleSheetContentNodeInternalId(googleFileId: string, googleSheetId: number): string;
export declare function getGoogleIdsFromSheetContentNodeInternalId(internalId: string): {
    googleFileId: string;
    googleSheetId: string;
};
export declare function isGoogleSheetContentNodeInternalId(internalId: string): boolean;
export declare function googleDriveIncrementalSyncWorkflowId(connectorId: ModelId): string;
//# sourceMappingURL=google_drive.d.ts.map