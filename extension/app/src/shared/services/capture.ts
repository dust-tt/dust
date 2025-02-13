import type { Result } from "@dust-tt/client";

export type CaptureOperationId = "capture-page-content" | "capture-screenshot";

export interface CaptureResult {
  captures?: string[];
  content?: string;
  error?: string;
  title: string;
  url?: string;
}

export interface CaptureService {
  handleOperation(
    operationId: CaptureOperationId,
    options?: any
  ): Promise<Result<CaptureResult, Error>>;

  isOperationSupported(operationId: CaptureOperationId): boolean;
}
