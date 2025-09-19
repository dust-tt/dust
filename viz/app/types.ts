// This defines the commands that the iframe can send to the host window.

// Define parameter types for each command.

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

interface setIframeReadyParams {
  ready: boolean;
}

// Define a mapped type to extend the base with specific parameters.
export type VisualizationRPCRequestMap = {
  getFile: GetFileParams;
  getCodeToExecute: null;
  setContentHeight: SetContentHeightParams;
  setErrorMessage: setErrorMessageParams;
  setIframeReady: setIframeReadyParams;
  downloadFileRequest: DownloadFileRequestParams;
  displayCode: null;
};

// Derive the command type from the keys of the request map
export type VisualizationRPCCommand = keyof VisualizationRPCRequestMap;

// Command results.

export interface CommandResultMap {
  getCodeToExecute: { code: string };
  getFile: { fileBlob: Blob | null };
  downloadFileRequest: { blob: Blob; filename?: string };
  setContentHeight: void;
  setErrorMessage: void;
  setIframeReady: void;
  displayCode: void;
}
