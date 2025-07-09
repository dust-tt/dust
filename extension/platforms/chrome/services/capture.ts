import { sendGetActiveTabMessage } from "@app/platforms/chrome/messages";
import type {
  CaptureOperationId,
  CaptureOptions,
  CaptureService,
  TabContent,
} from "@app/shared/services/capture";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

const getIncludeCurrentTab = async (params: CaptureOptions) => {
  const backgroundRes = await sendGetActiveTabMessage(params);
  const error = backgroundRes.error;
  if (error) {
    console.error("Failed to get content from the current tab.");
    return new Err(new Error(error));
  }

  return new Ok(backgroundRes);
};

export class ChromeCaptureService implements CaptureService {
  isOperationSupported(id: CaptureOperationId) {
    return ["capture-page-content"].includes(id);
  }

  async handleOperation(
    id: CaptureOperationId,
    options: CaptureOptions
  ): Promise<Result<TabContent, Error>> {
    switch (id) {
      case "capture-page-content":
        return getIncludeCurrentTab(options);

      default:
        throw new Error(`Operation ${id} not supported`);
    }
  }
}
