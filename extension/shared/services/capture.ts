import type { Result } from "@app/types/shared/result";

export type CaptureOperationId = "capture-page-content" | "capture-screenshot";

export interface FileData {
  base64: string;
  mimeType: string;
  url: string;
}

export interface TabContent {
  title: string;
  url?: string;
  content?: string;
  captures?: string[];
  fileData?: FileData;
}

export interface CaptureOptions {
  includeContent?: boolean;
  includeSelectionOnly?: boolean;
  includeCapture?: boolean;
  tabId?: number;
}

export interface CaptureService {
  isOperationSupported(id: CaptureOperationId): boolean;
  handleOperation(
    id: CaptureOperationId,
    options: CaptureOptions
  ): Promise<Result<TabContent, Error>>;
}
