import type { Result } from "@dust-tt/client";

export type CaptureOperationId = "capture-page-content" | "capture-screenshot";

export interface TabContent {
  title: string;
  url?: string;
  content?: string;
  captures?: string[];
}

export interface CaptureOptions {
  includeContent?: boolean;
  includeSelectionOnly?: boolean;
  includeCapture?: boolean;
}

export interface CaptureService {
  isOperationSupported(id: CaptureOperationId): boolean;
  handleOperation(
    id: CaptureOperationId,
    options: CaptureOptions
  ): Promise<Result<TabContent, Error>>;
}
