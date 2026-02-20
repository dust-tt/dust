import type { Result } from "@dust-tt/client";
import { Ok } from "@dust-tt/client";

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

// Mock capture service that provides no-op implementations when the real service is not available.
export function createMockCaptureService(): CaptureService {
  return {
    // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
