// This defines the commands that the iframe can send to the host window.

// Define parameter types for each command.

interface GetFileParams {
  fileId: string;
}

interface CallFunctionParams {
  functionId: string;
  input?: unknown;
}

interface SetContentHeightParams {
  height: number;
}

interface DownloadFileRequestParams {
  blob: Blob;
  filename?: string;
}

interface SetErrorMessageParams {
  errorMessage: string;
  fileId: string;
  isInteractiveContent: boolean;
}

interface EditTextParams {
  oldText: string;
  newText: string;
  targetFileId?: string;
  // Clicked element's `data-source` ("<relPath>:<line>:<col>") for location-based edits on a
  // published (bundled) Frame. When set, oldText/newText are the visible (trimmed) text.
  source?: string;
}

// Define a mapped type to extend the base with specific parameters.
export type VisualizationRPCRequestMap = {
  callFunction: CallFunctionParams;
  getFile: GetFileParams;
  getCodeToExecute: null;
  setContentHeight: SetContentHeightParams;
  setErrorMessage: SetErrorMessageParams;
  downloadFileRequest: DownloadFileRequestParams;
  displayCode: null;
  editText: EditTextParams;
};

// Derive the command type from the keys of the request map
export type VisualizationRPCCommand = keyof VisualizationRPCRequestMap;

// Command results.

export interface CommandResultMap {
  callFunction: { result: unknown; error?: string };
  getCodeToExecute: { code: string };
  getFile: { fileBlob: Blob | null };
  downloadFileRequest: { blob: Blob; filename?: string };
  setContentHeight: void;
  setErrorMessage: void;
  displayCode: void;
  editText: { success: boolean; error?: string };
}

export function isDevelopment() {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.IS_DEVELOPMENT === "true"
  );
}
