import type {
  SupportedEventType,
  SupportedMessage,
} from "@viz/app/types/messages";

/**
 * Data API - handles data fetching operations.
 * Implementation varies by wrapper (cache, RPC, etc.).
 */
export interface VisualizationDataAPI {
  /**
   * Fetch a file by ID.
   */
  fetchFile(fileId: string): Promise<File | null>;

  /**
   * Fetch visualization code.
   */
  fetchCode(): Promise<string | null>;
}

export type EditTextFn = (params: {
  newText: string;
  oldText: string;
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
