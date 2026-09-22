import type {
  UserIdentityState,
  WriteFileParams,
  WriteFileResult,
} from "@viz/app/types";
import type {
  SupportedEventType,
  SupportedMessage,
} from "@viz/app/types/messages";

export interface FileSnapshot {
  file: File;
  revision: string | null;
  canWrite: boolean;
}

/**
 * Data API - handles data fetching operations.
 * Implementation varies by wrapper (cache, RPC, etc.).
 */
export interface VisualizationDataAPI {
  /**
   * Call a sandbox function.
   */
  callFunction(functionId: string, input?: unknown): Promise<unknown>;

  /**
   * Return the user authenticated in the workspace owning this Frame.
   */
  getUserIdentity(): Promise<UserIdentityState>;

  /**
   * Fetch a file by ID.
   */
  fetchFile(fileId: string): Promise<File | null>;

  readFile(path: string): Promise<FileSnapshot | null>;

  writeFile(params: WriteFileParams): Promise<WriteFileResult>;

  /**
   * Fetch visualization code.
   */
  fetchCode(): Promise<string | null>;
}

export type EditTextFn = (params: {
  newText: string;
  oldText: string;
  targetFileId?: string;
  source?: string;
}) => Promise<{ success: boolean; error?: string }>;

export interface VisualizationUIAPI {
  addEventListener: (
    eventType: SupportedEventType,
    handler: (data: SupportedMessage) => void
  ) => () => void;
  displayCode: () => Promise<void>;
  downloadFile: (blob: Blob, filename?: string) => Promise<void>;
  editText: EditTextFn;
  sendHeightToParent: ({ height }: { height: number | null }) => Promise<void>;
}

/**
 * Complete Visualization API combining data and UI operations
 */
export interface VisualizationAPI {
  data: VisualizationDataAPI;
  ui: VisualizationUIAPI;
}

/**
 * Configuration for visualization rendering.
 */
export interface VisualizationConfig {
  identifier: string;
  allowedOrigins: string[];
  isEditable?: boolean;
  isFullHeight?: boolean;
  isPdfMode?: boolean;
  dataAPI: VisualizationDataAPI;
}
