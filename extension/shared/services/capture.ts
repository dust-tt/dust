import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

export type CaptureOperationId = "capture-page-content" | "capture-screenshot";

export interface TabContent {
  title: string;
  url?: string;
  contentType?: string;
  content?: string;
  captures?: string[];
}

export interface CaptureOptions {
  includeContent?: boolean;
  includeSelectionOnly?: boolean;
  includeCapture?: boolean;
  // When true, auto-selects the right capture strategy based on the page's
  // content type: HTML pages get text extraction, non-HTML pages get a screenshot.
  autoDetect?: boolean;
}

export interface CaptureService {
  isOperationSupported(id: CaptureOperationId): boolean;
  handleOperation(
    id: CaptureOperationId,
    options: CaptureOptions
  ): Promise<Result<TabContent, Error>>;
}

// Mock capture service that provides no-op implementations when the real service is not available.
export function createMockCaptureService(): CaptureService {
  return {
    handleOperation: async () => {
      return new Ok<TabContent>({
        title: "",
        url: "",
        content: "",
        captures: [],
      });
    },
    isOperationSupported: () => false,
  };
}
