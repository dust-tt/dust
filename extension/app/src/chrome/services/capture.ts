import { assertNever } from "@dust-tt/client";
import { getIncludeCurrentTab } from "@extension/lib/conversation";
import type { GetActiveTabOptions } from "@extension/lib/messages";
import type {
  CaptureOperationId,
  CaptureService,
} from "@extension/shared/services/capture";

export class ChromeCaptureService implements CaptureService {
  isOperationSupported(id: CaptureOperationId) {
    return ["capture-page-content"].includes(id);
  }

  async handleOperation(id: CaptureOperationId, options: GetActiveTabOptions) {
    switch (id) {
      case "capture-page-content":
        return getIncludeCurrentTab(options);

      case "capture-screenshot":
        throw new Error("Not implemented");

      default:
        assertNever(id);
    }
  }
}
