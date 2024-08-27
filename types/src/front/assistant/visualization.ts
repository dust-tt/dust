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

interface SetScreenshotParams {
  image: Blob;
}

// Define a mapped type to extend the base with specific parameters.
export type VisualizationRPCRequestMap = {
  getFile: GetFileParams;
  getCodeToExecute: null;
  setContentHeight: SetContentHeightParams;
  setErrored: void;
  setScreenshot: SetScreenshotParams;
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

export const validCommands: VisualizationRPCCommand[] = [
  "getFile",
  "getCodeToExecute",
  "setContentHeight",
  "setErrored",
  "setScreenshot",
];

// Command results.

export interface CommandResultMap {
  getFile: { fileBlob: Blob | null };
  getCodeToExecute: { code: string };
  setContentHeight: void;
  setErrored: void;
  setScreenshot: void;
}

// TODO(@fontanierh): refactor all these guards to use io-ts instead of manual checks.

// Type guard for getFile.
export function isGetFileRequest(
  value: unknown
): value is VisualizationRPCRequest & {
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
export function isGetCodeToExecuteRequest(
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
export function isSetContentHeightRequest(
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

export function isSetErroredRequest(
  value: unknown
): value is VisualizationRPCRequest & {
  command: "setErrored";
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Partial<VisualizationRPCRequest>;

  return (
    v.command === "setErrored" &&
    typeof v.identifier === "string" &&
    typeof v.messageUniqueId === "string"
  );
}

export function isSetScreenshotRequst(
  value: unknown
): value is VisualizationRPCRequest & {
  command: "setErrored";
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Partial<VisualizationRPCRequest>;

  return (
    v.command === "setScreenshot" &&
    typeof v.identifier === "string" &&
    typeof v.messageUniqueId === "string" &&
    typeof v.params === "object" &&
    v.params !== null
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
    isSetContentHeightRequest(value) ||
    isSetErroredRequest(value) ||
    isSetScreenshotRequst(value) 
  );
}
