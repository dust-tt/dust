// This defines the commands that the iframe can send to the host window.

// Common base interface.
interface VisualizationRPCRequestBase {
  identifier: string;
  messageUniqueId: string;
}

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

// Define a mapped type to extend the base with specific parameters.
export type VisualizationRPCRequestMap = {
  getFile: GetFileParams;
  getCodeToExecute: null;
  setContentHeight: SetContentHeightParams;
  setErrorMessage: setErrorMessageParams;
  downloadFileRequest: DownloadFileRequestParams;
  displayCode: null;
};

// Derive the command type from the keys of the request map
export type VisualizationRPCCommand = keyof VisualizationRPCRequestMap;

// Create a union type for requests based on the mapped type.
export type VisualizationRPCRequest = {
  [K in VisualizationRPCCommand]: VisualizationRPCRequestBase & {
    command: K;
    params: VisualizationRPCRequestMap[K];
  };
}[VisualizationRPCCommand];

const validCommands: VisualizationRPCCommand[] = [
  "getFile",
  "getCodeToExecute",
  "setContentHeight",
  "setErrorMessage",
];

// Command results.

export interface CommandResultMap {
  getCodeToExecute: { code: string };
  getFile: { fileBlob: Blob | null };
  downloadFileRequest: { blob: Blob; filename?: string };
  setContentHeight: void;
  setErrorMessage: void;
  displayCode: void;
}

// TODO(@fontanierh): refactor all these guards to use io-ts instead of manual checks.

// Type guard for getFile.
function isGetFileRequest(value: unknown): value is VisualizationRPCRequest & {
  command: "getFile";
  params: GetFileParams;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Partial<VisualizationRPCRequest>;

  return (
    v.command === "getFile" &&
    typeof v.identifier === "string" &&
    typeof v.messageUniqueId === "string" &&
    typeof v.params === "object" &&
    v.params !== null &&
    typeof (v.params as GetFileParams).fileId === "string"
  );
}

// Type guard for getCodeToExecute.
function isGetCodeToExecuteRequest(
  value: unknown
): value is VisualizationRPCRequest & {
  command: "getCodeToExecute";
  params: null;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Partial<VisualizationRPCRequest>;

  return (
    v.command === "getCodeToExecute" &&
    typeof v.identifier === "string" &&
    typeof v.messageUniqueId === "string"
  );
}

// Type guard for setContentHeight.
function isSetContentHeightRequest(
  value: unknown
): value is VisualizationRPCRequest & {
  command: "setContentHeight";
  params: SetContentHeightParams;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Partial<VisualizationRPCRequest>;

  return (
    v.command === "setContentHeight" &&
    typeof v.identifier === "string" &&
    typeof v.messageUniqueId === "string" &&
    typeof v.params === "object" &&
    v.params !== null &&
    typeof (v.params as SetContentHeightParams).height === "number"
  );
}

function isSetErrorMessageRequest(
  value: unknown
): value is VisualizationRPCRequest & {
  command: "setErrorMessage";
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Partial<VisualizationRPCRequest>;

  return (
    v.command === "setErrorMessage" &&
    typeof v.identifier === "string" &&
    typeof v.messageUniqueId === "string"
  );
}

function isDownloadFileRequest(
  value: unknown
): value is VisualizationRPCRequest & {
  command: "downloadFileRequest";
  params: DownloadFileRequestParams;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Partial<VisualizationRPCRequest>;

  return (
    v.command === "downloadFileRequest" &&
    typeof v.identifier === "string" &&
    typeof v.messageUniqueId === "string" &&
    typeof v.params === "object" &&
    v.params !== null &&
    (v.params as DownloadFileRequestParams).blob instanceof Blob
  );
}

// Type guard for getCodeToExecute.
function isDisplayCodeRequest(
  value: unknown
): value is VisualizationRPCRequest & {
  command: "displayCode";
  params: null;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Partial<VisualizationRPCRequest>;

  return (
    v.command === "displayCode" &&
    typeof v.identifier === "string" &&
    typeof v.messageUniqueId === "string"
  );
}

export function isVisualizationRPCRequest(
  value: unknown
): value is VisualizationRPCRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    isGetCodeToExecuteRequest(value) ||
    isGetFileRequest(value) ||
    isDownloadFileRequest(value) ||
    isSetContentHeightRequest(value) ||
    isSetErrorMessageRequest(value) ||
    isDisplayCodeRequest(value)
  );
}
